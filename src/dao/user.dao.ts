import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { Group, GroupMember, User } from "../models/index.js";
import { CreditStatus, KycStatus, TrustLevel } from "../models/enums.js";

export class UserDao {
  findByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email }, include: [{ model: GroupMember, as: "groups" }] });
  }

  findById(id: string, transaction?: Transaction): Promise<User | null> {
    return User.findOne({where: {id}, include: [{ model: GroupMember, as: "groups", include: [{ model: Group, as: "group" }]}]});
  }

  findByIds(ids: string[]): Promise<User[]> {
    return User.findAll({ where: { id: ids }, attributes: ["id", "monthlyIncome"] });
  }

  createUser(payload: {
    fullName: string;
    email: string;
    phone: string | null;
    passwordHash: string;
    location: string | null;
    employmentStatus: string | null;
    monthlyIncome: number | null;
    creditLimit: number;
    kycStatus: KycStatus;
    creditStatus: CreditStatus;
    trustScore?: number;
    trustLevel?: TrustLevel;
    kycStep?: number;
    emailVerified?: boolean;
    emailVerificationToken?: string | null;
    emailVerificationTokenExpiresAt?: Date | null;
  }): Promise<User> {
    return User.create({
      ...payload,
      trustScore: payload.trustScore ?? 0,
      trustLevel: payload.trustLevel ?? TrustLevel.BRONZE,
      kycStep: payload.kycStep ?? 0,
      emailVerified: payload.emailVerified ?? false,
      emailVerificationToken: payload.emailVerificationToken ?? null,
      emailVerificationTokenExpiresAt: payload.emailVerificationTokenExpiresAt ?? null
    });
  }

  findByEmailVerificationToken(token: string): Promise<User | null> {
    const now = new Date();
    return User.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: { [Op.gt]: now }
      }
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await User.update(
      {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null
      },
      { where: { id: userId } }
    );
  }

  async updateProfile(
    userId: string,
    data: {
      monthlyIncome?: number | null;
      employmentStatus?: string | null;
      location?: string | null;
    }
  ): Promise<User | null> {
    const user = await User.findByPk(userId);
    if (!user) return null;
    await user.update(data);
    return user;
  }

  async updateCreditLimit(userId: string, creditLimit: number): Promise<void> {
    await User.update({ creditLimit }, { where: { id: userId } });
  }

  async updateKycStep(userId: string, kycStep: number): Promise<User | null> {
    const user = await User.findByPk(userId);
    if (!user) return null;
    await user.update({ kycStep });
    return user;
  }

  findByPasswordResetToken(token: string): Promise<User | null> {
    const now = new Date();
    return User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetTokenExpiresAt: { [Op.gt]: now }
      }
    });
  }

  async setPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
    await User.update(
      { passwordResetToken: token, passwordResetTokenExpiresAt: expiresAt },
      { where: { id: userId } }
    );
  }

  async clearPasswordResetAndSetPassword(userId: string, passwordHash: string): Promise<void> {
    await User.update(
      {
        passwordHash,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null
      },
      { where: { id: userId } }
    );
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await User.update({ passwordHash }, { where: { id: userId } });
  }
}
