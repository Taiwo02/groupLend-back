import { Transaction } from "sequelize";
import { UserKycData } from "../models";
import type {
  BioDataPayload,
  ContactPayload,
  EmploymentDetailsPayload
} from "../models/user-kyc-data.model";

export class UserKycDataDao {
  findByUserId(userId: string, transaction?: Transaction): Promise<UserKycData | null> {
    return UserKycData.findOne({ where: { userId }, transaction });
  }

  async upsert(
    userId: string,
    data: {
      bioData?: BioDataPayload | null;
      contact?: ContactPayload | null;
      employmentDetails?: EmploymentDetailsPayload | null;
      profilePicture?: string | null;
      ninData?: Record<string, unknown> | null;
      submittedAt?: Date | null;
    },
    transaction?: Transaction
  ): Promise<UserKycData> {
    const existing = await this.findByUserId(userId, transaction);
    const payload = {
      bioData: data.bioData ?? existing?.bioData ?? null,
      contact: data.contact ?? existing?.contact ?? null,
      employmentDetails: data.employmentDetails ?? existing?.employmentDetails ?? null,
      profilePicture: data.profilePicture !== undefined ? data.profilePicture : existing?.profilePicture ?? null,
      ninData: data.ninData !== undefined ? data.ninData : existing?.ninData ?? null,
      submittedAt: data.submittedAt !== undefined ? data.submittedAt : existing?.submittedAt ?? null
    };
    if (existing) {
      await existing.update(payload, { transaction });
      return existing;
    }
    return UserKycData.create({ userId, ...payload }, { transaction });
  }
}
