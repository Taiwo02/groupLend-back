import { Op, Transaction } from "sequelize";
import { Group, GroupMember, User } from "../models/index.js";
import { CreditStatus, KycStatus, TrustLevel } from "../models/enums.js";

export class UserDao {
  findByEmail(email: string): Promise<User | null> {
    return User.findOne({
      where: { email },
      include: [{ model: GroupMember, as: "groups", include: [{ model: Group, as: "group" }] }]
    });
  }

  findById(id: string, transaction?: Transaction): Promise<User | null> {
    return User.findOne({where: {id}, include: [{ model: GroupMember, as: "groups", include: [{ model: Group, as: "group" }]}]});
  }

  findByIds(ids: string[], transaction?: Transaction): Promise<User[]> {
    return User.findAll({ where: { id: ids }, attributes: ["id", "monthlyIncome"], transaction });
  }

  /** For KYC checks: returns id, kycStatus, fullName for the given user ids. */
  findByIdsWithKyc(ids: string[], transaction?: Transaction): Promise<User[]> {
    return User.findAll({
      where: { id: ids },
      attributes: ["id", "kycStatus", "fullName", "monthlyIncome"],
      transaction
    });
  }

  /** Count users with KYC submitted (pending admin verification). */
  async countPendingKyc(transaction?: Transaction): Promise<number> {
    return User.count({
      where: { kycStatus: KycStatus.SUBMITTED },
      transaction
    });
  }

  /** Statuses that appear in admin KYC queue (pending review). */
  static readonly ADMIN_KYC_STATUSES: KycStatus[] = [
    KycStatus.PENDING,
    KycStatus.SUBMITTED,
    KycStatus.RESUBMITTED
  ];

  /** Count users with KYC status in PENDING, SUBMITTED, RESUBMITTED. Optionally filter by single status or search. */
  async countForAdminKyc(
    opts: { status?: KycStatus; search?: string } = {},
    transaction?: Transaction
  ): Promise<number> {
    const statusFilter = opts.status ? opts.status : { [Op.in]: UserDao.ADMIN_KYC_STATUSES };
    const where = opts.search?.trim()
      ? {
          [Op.and]: [
            { kycStatus: statusFilter },
            {
              [Op.or]: [
                { fullName: { [Op.iLike]: `%${opts.search!.trim()}%` } },
                { email: { [Op.iLike]: `%${opts.search!.trim()}%` } }
              ]
            }
          ]
        }
      : { kycStatus: statusFilter };
    return User.count({ where, transaction });
  }

  /** Find users for admin KYC list: status in (PENDING, SUBMITTED, RESUBMITTED), optional status filter and search. */
  async findForAdminKyc(
    opts: { status?: KycStatus; search?: string; limit?: number; offset?: number } = {},
    transaction?: Transaction
  ): Promise<User[]> {
    const statusFilter = opts.status ? opts.status : { [Op.in]: UserDao.ADMIN_KYC_STATUSES };
    const where = opts.search?.trim()
      ? {
          [Op.and]: [
            { kycStatus: statusFilter },
            {
              [Op.or]: [
                { fullName: { [Op.iLike]: `%${opts.search!.trim()}%` } },
                { email: { [Op.iLike]: `%${opts.search!.trim()}%` } }
              ]
            }
          ]
        }
      : { kycStatus: statusFilter };
    return User.findAll({
      where,
      attributes: ["id", "fullName", "email", "kycStatus", "kycStep", "createdAt"],
      limit: Math.min(opts.limit ?? 50, 100),
      offset: opts.offset ?? 0,
      order: [["createdAt", "DESC"]],
      transaction
    });
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

  /** Lookup by raw verification token (any expiry). Used to detect already-verified replays. */
  findByEmailVerificationTokenValue(token: string): Promise<User | null> {
    return User.findOne({ where: { emailVerificationToken: token } });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await User.update({ emailVerified: true }, { where: { id: userId } });
  }

  async setEmailVerificationToken(
    userId: string,
    token: string,
    expiresAt: Date
  ): Promise<void> {
    await User.update(
      {
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: expiresAt
      },
      { where: { id: userId } }
    );
  }

  async updateProfile(
    userId: string,
    data: {
      fullName?: string;
      phone?: string | null;
      monthlyIncome?: number | null;
      employmentStatus?: string | null;
      location?: string | null;
    },
    transaction?: Transaction
  ): Promise<User | null> {
    const user = await User.findByPk(userId, { transaction });
    if (!user) return null;
    await user.update(data, { transaction });
    return user;
  }

  async updateCreditLimit(userId: string, creditLimit: number, transaction?: Transaction): Promise<void> {
    await User.update({ creditLimit }, { where: { id: userId }, transaction });
  }

  async updateKycStep(userId: string, kycStep: number, transaction?: Transaction): Promise<User | null> {
    const user = await User.findByPk(userId, { transaction });
    if (!user) return null;
    await user.update({ kycStep }, { transaction });
    return user;
  }

  async updateKycStatus(userId: string, kycStatus: KycStatus, transaction?: Transaction): Promise<void> {
    await User.update({ kycStatus }, { where: { id: userId }, transaction });
  }

  async updateFullName(userId: string, fullName: string): Promise<User | null> {
    const user = await User.findByPk(userId);
    if (!user) return null;
    await user.update({ fullName: fullName.trim() });
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
