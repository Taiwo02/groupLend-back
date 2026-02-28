import { GroupDao } from "../dao/group.dao";
import { GroupInviteDao } from "../dao/group-invite.dao";
import { GroupMemberDao } from "../dao/group-member.dao";
import { UserDao } from "../dao/user.dao";
import { User } from "../models";
import { CreditStatus, KycStatus } from "../models/enums";
import { GroupMemberRole, GroupMemberStatus } from "../models/enums";
import { compareHash, hashValue, signJwt } from "../utils/auth";
import { HttpError } from "../utils/http-error";
import { EmailService } from "../email/email.service";
import { CreditService } from "./credit.service";

export type OnboardingState = "INCOME_PENDING" | "ONBOARDING_COMPLETE";

export type SignupInput = {
  fullName: string;
  email: string;
  password: string;
  phone?: string;
  location?: string;
  monthlyIncome: number;
  employmentStatus: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type SubmitIncomeInput = {
  monthlyIncome: number;
  employmentStatus?: string | null;
};

export class AuthService {
  constructor(
    private readonly userDao: UserDao,
    private readonly creditService: CreditService,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly groupInviteDao: GroupInviteDao,
    private readonly groupDao: GroupDao,
    private readonly emailService: EmailService
  ) {}

  async signup(input: SignupInput): Promise<{
    token: string;
    user: User;
    onboardingState: OnboardingState;
  }> {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await this.userDao.findByEmail(normalizedEmail);
    if (existing) throw new HttpError(409, "Email already exists");

    const passwordHash = await hashValue(input.password);
    const creditLimit = this.creditService.calculateIndividualCreditLimit(input.monthlyIncome);

    const user = await this.userDao.createUser({
      fullName: input.fullName,
      email: normalizedEmail,
      phone: input.phone ?? null,
      passwordHash,
      location: input.location ?? null,
      employmentStatus: input.employmentStatus,
      monthlyIncome: input.monthlyIncome,
      creditLimit,
      kycStatus: KycStatus.PENDING,
      creditStatus: CreditStatus.ACTIVE
    });

    const pendingInvites = await this.groupInviteDao.findPendingByEmail(normalizedEmail);
    if (pendingInvites.length > 0) {
      const [acceptedInvite] = pendingInvites;
      await this.groupMemberDao.createMember({
        groupId: acceptedInvite.groupId,
        userId: user.id,
        role: GroupMemberRole.MEMBER,
        status: GroupMemberStatus.ACTIVE
      });
      await this.groupInviteDao.markAccepted(acceptedInvite.id);
      await this.groupInviteDao.markExpiredForEmail(normalizedEmail, acceptedInvite.id);
      const pool = await this.creditService.calculateGroupCreditLimit(acceptedInvite.groupId);
      await this.groupDao.updateCreditPool(acceptedInvite.groupId, pool);
    }

    const token = signJwt({ sub: user.id, email: user.email });
    const onboardingState: OnboardingState = "ONBOARDING_COMPLETE";
    this.emailService.sendWelcome(user.email, { fullName: user.fullName }).catch(() => {});
    return { token, user, onboardingState };
  }

  async login(input: LoginInput): Promise<{
    token: string;
    user: User;
    onboardingState: OnboardingState;
  }> {
    const user = await this.userDao.findByEmail(input.email.toLowerCase());
    if (!user) throw new HttpError(401, "Invalid credentials");

    const valid = await compareHash(input.password, user.passwordHash);
    if (!valid) throw new HttpError(401, "Invalid credentials");

    const token = signJwt({ sub: user.id, email: user.email });
    const onboardingState: OnboardingState =
      user.monthlyIncome == null ? "INCOME_PENDING" : "ONBOARDING_COMPLETE";
    return { token, user, onboardingState };
  }

  getOnboardingState(user: User): OnboardingState {
    return user.monthlyIncome == null ? "INCOME_PENDING" : "ONBOARDING_COMPLETE";
  }

  /** Submit income (and optional employment). Recomputes individual credit limit and group pools. */
  async submitIncome(userId: string, input: SubmitIncomeInput): Promise<User> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(404, "User not found");

    const creditLimit = this.creditService.calculateIndividualCreditLimit(input.monthlyIncome);
    await this.userDao.updateProfile(userId, {
      monthlyIncome: input.monthlyIncome,
      employmentStatus: input.employmentStatus ?? user.employmentStatus
    });
    await this.userDao.updateCreditLimit(userId, creditLimit);

    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    for (const groupId of groupIds) {
      const pool = await this.creditService.calculateGroupCreditLimit(groupId);
      await this.groupDao.updateCreditPool(groupId, pool);
    }

    const updated = await this.userDao.findById(userId);
    if (!updated) throw new HttpError(500, "User not found after update");
    return updated;
  }

  /** Set loan PIN once (4 digits). Cannot be set again or changed after set. Hashed separately from password. */
  async setLoanPin(userId: string, pin: string): Promise<void> {
    if (!/^\d{4}$/.test(pin)) throw new HttpError(400, "Loan PIN must be exactly 4 digits");
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(404, "User not found");
    if (user.loanPinHash) throw new HttpError(409, "Loan PIN has already been set and cannot be changed");
    const loanPinHash = await hashValue(pin);
    const { User } = await import("../models");
    await User.update({ loanPinHash }, { where: { id: userId } });
  }
}
