import type { Transaction } from "sequelize";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { toNumber } from "../utils/number.js";

export class CreditService {
  constructor(
    private readonly groupMemberDao: GroupMemberDao,
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly groupDao: GroupDao
  ) {}

  calculateIndividualCreditLimit(monthlyIncome: number): number {
    return monthlyIncome * 3;
  }

  /**
   * Group pool = sum over active members of (effective monthly income × 2).
   * Uses `users.monthlyIncome` when set; otherwise falls back to KYC `employmentDetails.monthlyIncome`
   * (KYC step 2 does not always sync to the user row until we persist it).
   */
  async calculateGroupCreditLimit(groupId: string, transaction?: Transaction): Promise<number> {
    const activeMembers = await this.groupMemberDao.findActiveMemberUserIds(groupId, transaction);

    if (!activeMembers.length) return 0;

    const userIds = activeMembers.map((member) => member.userId);
    const [members, kycIncomes] = await Promise.all([
      this.userDao.findByIds(userIds, transaction),
      this.userKycDataDao.findEffectiveEmploymentIncomeByUserIds(userIds, transaction)
    ]);

    return members.reduce((sum, member) => {
      const fromUser = toNumber(member.monthlyIncome ?? 0);
      const fromKyc = kycIncomes.get(member.id) ?? 0;
      const income = fromUser > 0 ? fromUser : fromKyc;
      return sum + income * 2;
    }, 0);
  }

  /** Recompute `currentCreditPool` for every group the user is an active member of. */
  async recalculatePoolsForUserGroups(userId: string, transaction?: Transaction): Promise<void> {
    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId, transaction);
    for (const gid of groupIds) {
      const pool = await this.calculateGroupCreditLimit(gid, transaction);
      await this.groupDao.updateCreditPool(gid, pool, transaction);
    }
  }
}
