import { Op, type WhereOptions } from "sequelize";
import { Transaction } from "sequelize";
import { UserKycData } from "../models/index.js";
import type { KycStatus } from "../models/enums.js";
import { toNumber } from "../utils/number.js";
import type {
  BioDataPayload,
  ContactPayload,
  EmploymentDetailsPayload,
  KycRecordStatus
} from "../models/user-kyc-data.model.js";

export class UserKycDataDao {
  findById(id: string, transaction?: Transaction): Promise<UserKycData | null> {
    return UserKycData.findByPk(id, { transaction });
  }

  /** Draft row: submittedAt is null, used for customer step 0–2 updates. */
  findDraftByUserId(userId: string, transaction?: Transaction): Promise<UserKycData | null> {
    return UserKycData.findOne({
      where: { userId, submittedAt: null },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /**
   * Best-effort monthly income from KYC `employmentDetails` for each user.
   * Prefers draft row (newest by createdAt), else newest submitted row with income.
   */
  async findEffectiveEmploymentIncomeByUserIds(
    userIds: string[],
    transaction?: Transaction
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (userIds.length === 0) return result;

    const rows = await UserKycData.findAll({
      where: { userId: { [Op.in]: userIds } },
      attributes: ["userId", "employmentDetails", "submittedAt", "createdAt"],
      transaction
    });

    const byUser = new Map<string, typeof rows>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r);
      byUser.set(r.userId, list);
    }

    for (const uid of userIds) {
      const list = byUser.get(uid) ?? [];
      const drafts = list
        .filter((r) => r.submittedAt == null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const submitted = list
        .filter((r) => r.submittedAt != null)
        .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime());

      let income: number | undefined;
      for (const r of drafts) {
        const m = r.employmentDetails?.monthlyIncome;
        if (m != null && toNumber(m) > 0) {
          income = toNumber(m);
          break;
        }
      }
      if (income == null) {
        for (const r of submitted) {
          const m = r.employmentDetails?.monthlyIncome;
          if (m != null && toNumber(m) > 0) {
            income = toNumber(m);
            break;
          }
        }
      }
      if (income != null) result.set(uid, income);
    }

    return result;
  }

  /** For backward compat: draft if exists, else latest submitted. */
  async findByUserId(userId: string, transaction?: Transaction): Promise<UserKycData | null> {
    const draft = await this.findDraftByUserId(userId, transaction);
    if (draft) return draft;
    return UserKycData.findOne({
      where: { userId },
      order: [["submittedAt", "DESC"]],
      transaction
    });
  }

  async upsert(
    userId: string,
    data: {
      bioData?: BioDataPayload | null;
      contact?: ContactPayload | null;
      employmentDetails?: EmploymentDetailsPayload | null;
      profilePicture?: string | null;
      ninData?: Record<string, unknown> | null;
      bvnEncrypted?: string | null;
      ninLookupKey?: string | null;
      submittedAt?: Date | null;
    },
    transaction?: Transaction
  ): Promise<UserKycData> {
    const existing = await this.findDraftByUserId(userId, transaction);
    const payload = {
      bioData: data.bioData ?? existing?.bioData ?? null,
      contact: data.contact ?? existing?.contact ?? null,
      employmentDetails: data.employmentDetails ?? existing?.employmentDetails ?? null,
      profilePicture: data.profilePicture !== undefined ? data.profilePicture : existing?.profilePicture ?? null,
      ninData: data.ninData !== undefined ? data.ninData : existing?.ninData ?? null,
      bvnEncrypted: data.bvnEncrypted !== undefined ? data.bvnEncrypted : existing?.bvnEncrypted ?? null,
      ninLookupKey: data.ninLookupKey !== undefined ? data.ninLookupKey : existing?.ninLookupKey ?? null,
      submittedAt: data.submittedAt !== undefined ? data.submittedAt : existing?.submittedAt ?? null
    };
    if (existing) {
      await existing.update(payload, { transaction });
      return existing;
    }
    return UserKycData.create(
      { userId, status: "PENDING", ...payload },
      { transaction }
    );
  }

  /** Create a new submitted KYC record (on user submit step 3). Returns the new record with id. */
  async createSubmitted(
    userId: string,
    data: {
      bioData?: BioDataPayload | null;
      contact?: ContactPayload | null;
      employmentDetails?: EmploymentDetailsPayload | null;
      profilePicture?: string | null;
      ninData?: Record<string, unknown> | null;
      bvnEncrypted?: string | null;
      ninLookupKey?: string | null;
    },
    transaction?: Transaction
  ): Promise<UserKycData> {
    return UserKycData.create(
      {
        userId,
        status: "SUBMITTED",
        submittedAt: new Date(),
        ...data
      },
      { transaction }
    );
  }

  /**
   * Admin list: all user_kyc_data rows by default.
   * Optional `userKycStatus` filters by users.kycStatus (User table).
   * Optional `search` filters by user fullName/email.
   */
  async findForAdminList(
    opts: {
      userKycStatus?: KycStatus;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
    transaction?: Transaction
  ): Promise<UserKycData[]> {
    const where: Record<string, unknown> = {};
    if (opts.userKycStatus != null || opts.search?.trim()) {
      const q = opts.search?.trim();
      let userWhere: WhereOptions;
      if (opts.userKycStatus != null && q) {
        userWhere = {
          kycStatus: opts.userKycStatus,
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } }
          ]
        };
      } else if (opts.userKycStatus != null) {
        userWhere = { kycStatus: opts.userKycStatus };
      } else {
        userWhere = {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } }
          ]
        };
      }
      const { User } = await import("../models/index.js");
      const users = await User.findAll({
        where: userWhere,
        attributes: ["id"],
        transaction
      });
      const userIds = users.map((u) => u.id);
      if (userIds.length === 0) return [];
      where.userId = { [Op.in]: userIds };
    }
    return UserKycData.findAll({
      where,
      limit: Math.min(opts.limit ?? 50, 100),
      offset: opts.offset ?? 0,
      order: [["submittedAt", "DESC"], ["createdAt", "DESC"]],
      transaction
    });
  }

  async countForAdminList(
    opts: { userKycStatus?: KycStatus; search?: string } = {},
    transaction?: Transaction
  ): Promise<number> {
    const where: Record<string, unknown> = {};
    if (opts.userKycStatus != null || opts.search?.trim()) {
      const q = opts.search?.trim();
      let userWhere: WhereOptions;
      if (opts.userKycStatus != null && q) {
        userWhere = {
          kycStatus: opts.userKycStatus,
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } }
          ]
        };
      } else if (opts.userKycStatus != null) {
        userWhere = { kycStatus: opts.userKycStatus };
      } else {
        userWhere = {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } }
          ]
        };
      }
      const { User } = await import("../models/index.js");
      const users = await User.findAll({
        where: userWhere,
        attributes: ["id"],
        transaction
      });
      const userIds = users.map((u) => u.id);
      if (userIds.length === 0) return 0;
      where.userId = { [Op.in]: userIds };
    }
    return UserKycData.count({ where, transaction });
  }

  async updateStatus(id: string, status: KycRecordStatus, transaction?: Transaction): Promise<void> {
    await UserKycData.update({ status }, { where: { id }, transaction });
  }
}
