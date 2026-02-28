import { Transaction } from "sequelize";
import { DirectDebitMandate } from "../models";
import { MandateStatus } from "../models/enums";

export class DirectDebitMandateDao {
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
}
