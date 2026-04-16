import { Transaction } from "sequelize";
import { GroupInviteDao } from "../dao/group-invite.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { DbDao } from "../dao/db.dao.js";
import { CreditService } from "./credit.service.js";
import { EmailService } from "../email/email.service.js";
import { CreditStatus, GroupMemberRole, GroupMemberStatus, KycStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { hashValue, signJwt } from "../utils/auth.js";
import type { SignupInput } from "./auth.service.js";

export type InvitationInfo = {
  type: "signup" | "invited";
  groupId: string;
  groupName: string;
  inviterName: string;
  /** Only for type signup: pre-filled email from invite */
  email?: string;
};

export class InvitationService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly groupInviteDao: GroupInviteDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly groupDao: GroupDao,
    private readonly userDao: UserDao,
    private readonly creditService: CreditService,
    private readonly emailService: EmailService
  ) {}

  async getByToken(token: string): Promise<InvitationInfo> {
    const groupInvite = await this.groupInviteDao.findByInvitationToken(token);
    if (groupInvite) {
      const group = await this.groupDao.findById(groupInvite.groupId);
      const inviter = group ? await this.userDao.findById(group.createdBy) : null;
      return {
        type: "signup",
        groupId: groupInvite.groupId,
        groupName: group?.name ?? "",
        inviterName: inviter?.fullName ?? "Someone",
        email: groupInvite.email
      };
    }
    const groupMember = await this.groupMemberDao.findByInvitationToken(token);
    if (groupMember) {
      const group = await this.groupDao.findById(groupMember.groupId);
      const inviter = group ? await this.userDao.findById(group.createdBy) : null;
      return {
        type: "invited",
        groupId: groupMember.groupId,
        groupName: group?.name ?? "",
        inviterName: inviter?.fullName ?? "Someone"
      };
    }
    throw new HttpError(404, "Invitation not found or expired");
  }

  /**
   * Accept invitation.
   * - If body has signup data (type signup): create user with email already verified (invite proves ownership), add to group, return token so they can sign in.
   * - If Authorization header (type invited): caller must be the invited user; set member status ACTIVE.
   */
  async accept(
    token: string,
    options: { userId?: string; signup?: SignupInput }
  ): Promise<{
    message: string;
    user?: { id: string; email: string; fullName: string };
    groupId?: string;
    token?: string;
    onboardingState?: string;
  }> {
    const groupInvite = await this.groupInviteDao.findByInvitationToken(token);
    if (groupInvite) {
      if (!options.signup) {
        throw new HttpError(400, "This invitation requires sign up. Please provide signup details.");
      }
      const normalizedEmail = options.signup.email.toLowerCase().trim();
      if (normalizedEmail !== groupInvite.email.toLowerCase()) {
        throw new HttpError(400, "Email must match the invited email address.");
      }
      return this.acceptSignupInvite(groupInvite.id, groupInvite.groupId, groupInvite.email, options.signup);
    }

    const groupMember = await this.groupMemberDao.findByInvitationToken(token);
    if (groupMember) {
      if (!options.userId) {
        throw new HttpError(401, "Please sign in to accept this invitation.");
      }
      if (groupMember.userId !== options.userId) {
        throw new HttpError(403, "This invitation was sent to a different account.");
      }
      return this.acceptInvitedMember(token, groupMember.groupId, groupMember.userId);
    }

    throw new HttpError(404, "Invitation not found or expired");
  }

  private async acceptSignupInvite(
    inviteId: string,
    groupId: string,
    _inviteEmail: string,
    input: SignupInput
  ): Promise<{
    message: string;
    user: { id: string; email: string; fullName: string };
    groupId: string;
    token: string;
    onboardingState: string;
  }> {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await this.userDao.findByEmail(normalizedEmail);
    if (existing) {
      throw new HttpError(409, "An account with this email already exists. Please sign in and accept the invitation from your account.");
    }

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
      creditStatus: CreditStatus.ACTIVE,
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null
    });

    await this.dbDao.withTransaction(async (transaction: Transaction) => {
      await this.groupMemberDao.createMember(
        {
          groupId,
          userId: user.id,
          role: GroupMemberRole.MEMBER,
          status: GroupMemberStatus.ACTIVE
        },
        transaction
      );
      const groupRow = await this.groupDao.findById(groupId, transaction);
      if (groupRow?.createdBy === user.id) {
        await this.groupMemberDao.updateMemberRole(groupId, user.id, GroupMemberRole.CREATOR, transaction);
      }
      await this.groupInviteDao.markAccepted(inviteId, transaction);
      await this.groupInviteDao.markExpiredForEmail(normalizedEmail, inviteId, transaction);
      await this.creditService.applyComputedGroupCredit(groupId, transaction);
    });

    const jwt = signJwt({ sub: user.id, email: user.email });
    const onboardingState = user.monthlyIncome != null ? "ONBOARDING_COMPLETE" : "INCOME_PENDING";

    return {
      message: "Account created and you have joined the group. You can sign in now.",
      user: { id: user.id, email: user.email, fullName: user.fullName },
      groupId,
      token: jwt,
      onboardingState
    };
  }

  private async acceptInvitedMember(
    token: string,
    groupId: string,
    userId: string
  ): Promise<{ message: string; groupId?: string }> {
    await this.dbDao.withTransaction(async (transaction: Transaction) => {
      await this.groupMemberDao.updateMemberStatus(groupId, userId, GroupMemberStatus.ACTIVE, transaction);
      await this.groupMemberDao.clearInvitationToken(token, transaction);
      await this.creditService.applyComputedGroupCredit(groupId, transaction);
    });
    return { message: "You have joined the group.", groupId };
  }

  async reject(token: string): Promise<{ message: string }> {
    const groupInvite = await this.groupInviteDao.findByInvitationToken(token);
    if (groupInvite) {
      await this.groupInviteDao.markExpired(groupInvite.id);
      return { message: "Invitation declined." };
    }
    const groupMember = await this.groupMemberDao.findByInvitationToken(token);
    if (groupMember) {
      await this.groupMemberDao.deleteByGroupAndUser(groupMember.groupId, groupMember.userId);
      return { message: "Invitation declined." };
    }
    throw new HttpError(404, "Invitation not found or expired");
  }
}
