import { Op, Transaction } from "sequelize";
import { DirectDebitMandate } from "../models/index.js";
import { MandateStatus } from "../models/enums.js";

export class DirectDebitMandateDao {
  create(
    payload: { userId: string; groupId: string; status?: MandateStatus },
    transaction?: Transaction
  ): Promise<DirectDebitMandate> {
    return DirectDebitMandate.create(
      { ...payload, status: payload.status ?? MandateStatus.INACTIVE },
      { transaction: transaction ?? undefined }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<DirectDebitMandate | null> {
    return DirectDebitMandate.findByPk(id, { transaction });
  }

  findByUserAndGroup(
    userId: string,
    groupId: string,
    transaction?: Transaction
  ): Promise<DirectDebitMandate | null> {
    return DirectDebitMandate.findOne({
      where: { userId, groupId },
      transaction
    });
  }

  /**
   * Group IDs where the user has an ACTIVE direct-debit mandate created within the last 12 months
   * (same validity window as loan approval).
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
        status: MandateStatus.ACTIVE
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

  async findAllActiveByGroupUserIds(
    groupId: string,
    userIds: string[],
    transaction?: Transaction
  ): Promise<Map<string, MandateStatus>> {
    const mandates = await DirectDebitMandate.findAll({
      where: { groupId, userId: userIds },
      transaction
    });
    const map = new Map<string, MandateStatus>();
    for (const m of mandates) {
      map.set(m.userId, m.status);
    }
    return map;
  }

  async countActiveByGroup(groupId: string, userIds: string[], transaction?: Transaction): Promise<number> {
    const count = await DirectDebitMandate.count({
      where: { groupId, userId: userIds, status: MandateStatus.ACTIVE },
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

  async setActive(id: string, transaction?: Transaction): Promise<DirectDebitMandate | null> {
    const m = await DirectDebitMandate.findByPk(id, { transaction });
    if (!m) return null;
    await m.update({ status: MandateStatus.ACTIVE }, { transaction });
    return m;
  }
}
