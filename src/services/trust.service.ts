import { Transaction } from "sequelize";
import { GroupDao } from "../dao/group.dao";
import { UserDao } from "../dao/user.dao";
import { CredibilityLevel, TrustLevel } from "../models/enums";
import { toNumber } from "../utils/number";

const TRUST_SCORE_REPAYMENT_DELTA = 2;
const TRUST_SCORE_DEFAULT_DELTA = -15;
const TRUST_SCORE_LATE_APPROVAL_HOURS_PENALTY = 0.5; // per hour over 24h
const CREDIBILITY_REPAYMENT_DELTA = 1;
const CREDIBILITY_DEFAULT_DELTA = -10;
const TRUST_LEVEL_SILVER_MIN = 34;
const TRUST_LEVEL_GOLD_MIN = 67;
const CREDIBILITY_VERIFIED_MIN = 70;

export class TrustService {
  constructor(
    private readonly userDao: UserDao,
    private readonly groupDao: GroupDao
  ) {}

  async onRepaymentRecorded(
    borrowerId: string,
    groupId: string | null,
    transaction?: Transaction
  ): Promise<void> {
    const user = await this.userDao.findById(borrowerId, transaction);
    if (!user) return;
    const newScore = Math.max(0, toNumber(user.trustScore) + TRUST_SCORE_REPAYMENT_DELTA);
    await this.updateUserTrust(user.id, newScore, transaction);

    if (groupId) {
      const group = await this.groupDao.findById(groupId, transaction);
      if (group) {
        const newCred = Math.max(0, toNumber(group.credibilityScore) + CREDIBILITY_REPAYMENT_DELTA);
        await this.updateGroupCredibility(group.id, newCred, transaction);
      }
    }
  }

  async onDefault(borrowerId: string, groupId: string | null, transaction?: Transaction): Promise<void> {
    const user = await this.userDao.findById(borrowerId, transaction);
    if (!user) return;
    const newScore = Math.max(0, toNumber(user.trustScore) + TRUST_SCORE_DEFAULT_DELTA);
    await this.updateUserTrust(user.id, newScore, transaction);

    if (groupId) {
      const group = await this.groupDao.findById(groupId, transaction);
      if (group) {
        const newCred = Math.max(0, toNumber(group.credibilityScore) + CREDIBILITY_DEFAULT_DELTA);
        await this.updateGroupCredibility(group.id, newCred, transaction);
      }
    }
  }

  /**
   * Call when an approver responds. Penalize late approvals (e.g. after 24h).
   */
  async onApprovalResponded(
    approverId: string,
    requestedAt: Date,
    respondedAt: Date,
    transaction?: Transaction
  ): Promise<void> {
    const user = await this.userDao.findById(approverId, transaction);
    if (!user) return;
    const hoursLate = Math.max(0, (respondedAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60) - 24);
    const penalty = hoursLate * TRUST_SCORE_LATE_APPROVAL_HOURS_PENALTY;
    const newScore = Math.max(0, toNumber(user.trustScore) - penalty);
    await this.updateUserTrust(user.id, newScore, transaction);
  }

  private async updateUserTrust(
    userId: string,
    trustScore: number,
    transaction?: Transaction
  ): Promise<void> {
    const level =
      trustScore >= TRUST_LEVEL_GOLD_MIN
        ? TrustLevel.GOLD
        : trustScore >= TRUST_LEVEL_SILVER_MIN
          ? TrustLevel.SILVER
          : TrustLevel.BRONZE;
    const { User } = await import("../models");
    await User.update(
      { trustScore: Number(trustScore.toFixed(2)), trustLevel: level },
      { where: { id: userId }, transaction }
    );
  }

  private async updateGroupCredibility(
    groupId: string,
    credibilityScore: number,
    transaction?: Transaction
  ): Promise<void> {
    const level =
      credibilityScore >= CREDIBILITY_VERIFIED_MIN
        ? CredibilityLevel.VERIFIED_TRUST_GROUP
        : CredibilityLevel.STANDARD;
    const { Group } = await import("../models");
    await Group.update(
      { credibilityScore: Number(credibilityScore.toFixed(2)), credibilityLevel: level },
      { where: { id: groupId }, transaction }
    );
  }
}
