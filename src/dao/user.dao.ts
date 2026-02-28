import { Transaction } from "sequelize";
import { User } from "../models";
import { CreditStatus, KycStatus, TrustLevel } from "../models/enums";

export class UserDao {
  findByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email } });
  }

  findById(id: string, transaction?: Transaction): Promise<User | null> {
    return User.findByPk(id, { transaction });
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
  }): Promise<User> {
    return User.create({
      ...payload,
      trustScore: payload.trustScore ?? 0,
      trustLevel: payload.trustLevel ?? TrustLevel.BRONZE,
      kycStep: payload.kycStep ?? 0
    });
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
}
