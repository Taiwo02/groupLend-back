import { Op, Transaction } from "sequelize";
import { DirectDebitMandate } from "../models/index.js";
import { MandateStatus } from "../models/enums.js";

export class DirectDebitMandateDao {
  create(
    payload: { userId: string; groupId?: string | null; status?: MandateStatus },
    transaction?: Transaction
  ): Promise<DirectDebitMandate> {
    return DirectDebitMandate.create(
      { ...payload, groupId: payload.groupId ?? null, status: payload.status ?? MandateStatus.INACTIVE },
      { transaction: transaction ?? undefined }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<DirectDebitMandate | null> {
    return DirectDebitMandate.findByPk(id, { transaction });
  }

  /** Latest direct-debit mandate row for this user+group (multiple rows possible across renewals). */
  findByUserAndGroup(
    userId: string,
    groupId: string,
    transaction?: Transaction
  ): Promise<DirectDebitMandate | null> {
    return DirectDebitMandate.findOne({
      where: { userId, groupId },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /** Latest individual (no-group) direct-debit mandate for a user. */
  findByUserOnly(userId: string, transaction?: Transaction): Promise<DirectDebitMandate | null> {
    return DirectDebitMandate.findOne({
      where: { userId, groupId: null },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /**
   * Group IDs where the user has an ACTIVE/APPROVED direct-debit mandate created
   * within the last 12 months (same validity window as loan approval).
   */
  async findRunningMandateGroupIdsForUser(
    userId: string,
    groupIds: string[],
    transaction?: Transaction
  ): Promise<Set<string>> {
    if (groupIds.length === 0) return new Set();
    const mandates = await DirectDebitMandate.findAll({
      where: {
        userId,
        groupId: { [Op.in]: groupIds },
        status: { [Op.in]: [MandateStatus.ACTIVE, MandateStatus.APPROVED] }
      },
      attributes: ["groupId", "createdAt"],
      transaction
    });
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const set = new Set<string>();
    for (const m of mandates) {
      const gid = m.groupId;
      if (!gid) continue;
      const created = m.createdAt ?? new Date(0);
      if (created >= oneYearAgo) set.add(gid);
    }
    return set;
  }

  /** Latest direct-debit mandate status per user in the group (multiple rows per user+group possible). */
  async findAllActiveByGroupUserIds(
    groupId: string,
    userIds: string[],
    transaction?: Transaction
  ): Promise<Map<string, MandateStatus>> {
    const mandates = await DirectDebitMandate.findAll({
      where: { groupId, userId: userIds },
      order: [["createdAt", "DESC"]],
      transaction
    });
    const map = new Map<string, MandateStatus>();
    for (const m of mandates) {
      if (!map.has(m.userId)) map.set(m.userId, m.status);
    }
    return map;
  }

  async countActiveByGroup(groupId: string, userIds: string[], transaction?: Transaction): Promise<number> {
    const count = await DirectDebitMandate.count({
      where: { groupId, userId: userIds, status: { [Op.in]: [MandateStatus.ACTIVE, MandateStatus.APPROVED] } },
      transaction
    });
    return count;
  }

  async updateSessionAndResend(
    id: string,
    data: { monoSessionId?: string | null; lastResendAt?: Date | null; monoCustomerId?: string | null },
    transaction?: Transaction
  ): Promise<void> {
    const m = await DirectDebitMandate.findByPk(id, { transaction });
    if (m) await m.update(data, { transaction });
  }

  async setActive(id: string, status: MandateStatus, transaction?: Transaction): Promise<DirectDebitMandate | null> {
    const m = await DirectDebitMandate.findByPk(id, { transaction });
    if (!m) return null;
    await m.update({ status: status }, { transaction });
    return m;
  }
}
