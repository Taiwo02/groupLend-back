import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { UserKycData } from "../models/index.js";
import type {
  BioDataPayload,
  ContactPayload,
  EmploymentDetailsPayload,
  KycRecordStatus
} from "../models/user-kyc-data.model.js";

const QUEUE_STATUSES: KycRecordStatus[] = ["PENDING", "SUBMITTED", "RESUBMITTED"];

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

  /** Admin list: KYC records with status in queue, optional filter and search. */
  async findForAdminList(
    opts: { status?: KycRecordStatus; search?: string; limit?: number; offset?: number } = {},
    transaction?: Transaction
  ): Promise<UserKycData[]> {
    const statusFilter = opts.status ?? { [Op.in]: QUEUE_STATUSES };
    const where: Record<string, unknown> = { status: statusFilter };
    if (opts.search?.trim()) {
      const { User } = await import("../models/index.js");
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${opts.search.trim()}%` } },
            { email: { [Op.iLike]: `%${opts.search.trim()}%` } }
          ]
        },
        attributes: ["id"]
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
    opts: { status?: KycRecordStatus; search?: string } = {},
    transaction?: Transaction
  ): Promise<number> {
    const statusFilter = opts.status ?? { [Op.in]: QUEUE_STATUSES };
    const where: Record<string, unknown> = { status: statusFilter };
    if (opts.search?.trim()) {
      const { User } = await import("../models/index.js");
      const users = await User.findAll({
        where: {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${opts.search.trim()}%` } },
            { email: { [Op.iLike]: `%${opts.search.trim()}%` } }
          ]
        },
        attributes: ["id"]
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
