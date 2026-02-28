import { Transaction } from "sequelize";
import { UserKycOtp } from "../models/index.js";
import type { NinLookupData } from "../types/nin.js";

export class UserKycOtpDao {
  findByUserId(userId: string, transaction?: Transaction): Promise<UserKycOtp | null> {
    return UserKycOtp.findOne({ where: { userId }, transaction });
  }

  async upsert(
    userId: string,
    data: { ninData: NinLookupData; otpHash: string; phone: string; expiresAt: Date },
    transaction?: Transaction
  ): Promise<UserKycOtp> {
    const existing = await this.findByUserId(userId, transaction);
    if (existing) {
      await existing.update(data, { transaction });
      return existing;
    }
    return UserKycOtp.create({ userId, ...data }, { transaction });
  }

  async deleteByUserId(userId: string, transaction?: Transaction): Promise<void> {
    await UserKycOtp.destroy({ where: { userId }, transaction });
  }
}
