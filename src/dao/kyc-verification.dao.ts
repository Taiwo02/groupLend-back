import { Transaction } from "sequelize";
import { KycVerification } from "../models/kyc-verification.model.js";
import type { KycVerificationStatus } from "../models/kyc-verification.model.js";

export class KycVerificationDao {
  findByUserId(userId: string, transaction?: Transaction): Promise<KycVerification | null> {
    return KycVerification.findOne({ where: { userId }, transaction });
  }

  findByKycDataId(kycDataId: string, transaction?: Transaction): Promise<KycVerification | null> {
    return KycVerification.findOne({ where: { kycDataId }, transaction });
  }

  async upsert(
    userId: string,
    data: {
      ninApproved?: boolean;
      bvnApproved?: boolean;
      addressApproved?: boolean;
      creditHistoryApproved?: boolean;
      overallStatus?: KycVerificationStatus;
      comment?: string | null;
      kycDataId?: string | null;
    },
    transaction?: Transaction
  ): Promise<KycVerification> {
    const existing = data.kycDataId
      ? await this.findByKycDataId(data.kycDataId, transaction)
      : await this.findByUserId(userId, transaction);
    const payload = {
      kycDataId: data.kycDataId ?? existing?.kycDataId ?? null,
      ninApproved: data.ninApproved ?? existing?.ninApproved ?? false,
      bvnApproved: data.bvnApproved ?? existing?.bvnApproved ?? false,
      addressApproved: data.addressApproved ?? existing?.addressApproved ?? false,
      creditHistoryApproved: data.creditHistoryApproved ?? existing?.creditHistoryApproved ?? false,
      overallStatus: data.overallStatus ?? existing?.overallStatus ?? "PENDING",
      comment: data.comment !== undefined ? data.comment : existing?.comment ?? null
    };
    if (existing) {
      await existing.update(payload, { transaction });
      return existing;
    }
    return KycVerification.create({ userId, ...payload }, { transaction });
  }

  /** Create or update verification for a specific KYC record (by kycDataId). */
  async upsertByKycDataId(
    kycDataId: string,
    userId: string,
    data: {
      ninApproved?: boolean;
      bvnApproved?: boolean;
      addressApproved?: boolean;
      creditHistoryApproved?: boolean;
      overallStatus?: KycVerificationStatus;
      comment?: string | null;
    },
    transaction?: Transaction
  ): Promise<KycVerification> {
    return this.upsert(userId, { ...data, kycDataId }, transaction);
  }

  countPending(transaction?: Transaction): Promise<number> {
    return KycVerification.count({
      where: { overallStatus: "PENDING" },
      transaction
    });
  }
}
