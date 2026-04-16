import type { Transaction } from "sequelize";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { toNumber } from "../utils/number.js";

/** Per member: 40% of monthly income × 6 months; then group total = sum + 50% of that sum. */
const GROUP_TARGET_INCOME_SHARE = 0.4;
const GROUP_TARGET_MONTHS = 6;
const GROUP_TARGET_SUM_BONUS = 0.5;

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
   * Group `targetCredit`: for each active member, (40% of monthly income × 6), summed;
   * then add 50% of that sum. Uses `users.monthlyIncome` when set; otherwise KYC employment income.
   */
  async calculateGroupTargetCredit(groupId: string, transaction?: Transaction): Promise<number> {
    const activeMembers = await this.groupMemberDao.findActiveMemberUserIds(groupId, transaction);

    if (!activeMembers.length) return 0;

    const userIds = activeMembers.map((member) => member.userId);
    const [members, kycIncomes] = await Promise.all([
      this.userDao.findByIds(userIds, transaction),
      this.userKycDataDao.findEffectiveEmploymentIncomeByUserIds(userIds, transaction)
    ]);

    const memberSum = members.reduce((sum, member) => {
      const fromUser = toNumber(member.monthlyIncome ?? 0);
      const fromKyc = kycIncomes.get(member.id) ?? 0;
      const income = fromUser > 0 ? fromUser : fromKyc;
      return sum + GROUP_TARGET_INCOME_SHARE * income * GROUP_TARGET_MONTHS;
    }, 0);

    const target = memberSum * (1 + GROUP_TARGET_SUM_BONUS);
    return Number(target.toFixed(2));
  }

  /**
   * Backwards-compatible alias: same as {@link calculateGroupTargetCredit}.
   */
  async calculateGroupCreditLimit(groupId: string, transaction?: Transaction): Promise<number> {
    return this.calculateGroupTargetCredit(groupId, transaction);
  }

  /**
   * Persist computed group credit: updates both `targetCredit` and `currentCreditPool`
   * (same as existing recalc behaviour, which replaced the pool with the computed figure).
   */
  async applyComputedGroupCredit(groupId: string, transaction?: Transaction): Promise<number> {
    const target = await this.calculateGroupTargetCredit(groupId, transaction);
    await this.groupDao.updateGroup(
      groupId,
      { targetCredit: target, currentCreditPool: target },
      transaction
    );
    return target;
  }

  /** Recompute `targetCredit` and `currentCreditPool` for every group the user is an active member of. */
  async recalculatePoolsForUserGroups(userId: string, transaction?: Transaction): Promise<void> {
    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId, transaction);
    for (const gid of groupIds) {
      await this.applyComputedGroupCredit(gid, transaction);
    }
  }
}
