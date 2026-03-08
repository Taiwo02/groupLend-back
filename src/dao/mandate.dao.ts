import { Transaction } from "sequelize";
import { Mandate } from "../models/index.js";
import { GroupMandateStatus } from "../models/enums.js";

export class MandateDao {
  create(
    payload: {
      groupId: string;
      year: number;
      totalAccessAmount: number;
      startDate: Date;
      endDate: Date;
      status?: GroupMandateStatus;
    },
    transaction?: Transaction
  ): Promise<Mandate> {
    return Mandate.create(
      { ...payload, status: payload.status ?? GroupMandateStatus.ACTIVE },
      { transaction: transaction ?? undefined }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<Mandate | null> {
    return Mandate.findByPk(id, { transaction });
  }

  /** Active mandate for group for the given year. */
  findActiveByGroupAndYear(
    groupId: string,
    year: number,
    transaction?: Transaction
  ): Promise<Mandate | null> {
    return Mandate.findOne({
      where: { groupId, year, status: GroupMandateStatus.ACTIVE },
      transaction
    });
  }

  findByGroupId(groupId: string, transaction?: Transaction): Promise<Mandate[]> {
    return Mandate.findAll({ where: { groupId }, order: [["year", "DESC"]], transaction });
  }
}
