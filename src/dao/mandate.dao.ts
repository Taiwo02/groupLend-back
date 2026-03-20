import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { Mandate } from "../models/index.js";
import { GroupMandateStatus } from "../models/enums.js";
import { toLocalDateYmd } from "../utils/mandate-period.js";

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

  /**
   * Mark ACTIVE mandates whose period has ended (endDate strictly before today, local date).
   * Needed so a new period can be created without violating UNIQUE(groupId, year).
   */
  async expireMandatesPastEndDate(groupId: string, transaction?: Transaction): Promise<void> {
    const today = toLocalDateYmd(new Date());
    await Mandate.update(
      { status: GroupMandateStatus.EXPIRED },
      {
        where: {
          groupId,
          status: GroupMandateStatus.ACTIVE,
          endDate: { [Op.lt]: today }
        },
        transaction
      }
    );
  }

  /**
   * Current group lending mandate: ACTIVE and period not ended (endDate >= today, local date).
   * Includes periods whose startDate is still in the future (e.g. starts 25 days after creation).
   */
  findCurrentGroupMandate(groupId: string, transaction?: Transaction): Promise<Mandate | null> {
    const today = toLocalDateYmd(new Date());
    return Mandate.findOne({
      where: {
        groupId,
        status: GroupMandateStatus.ACTIVE,
        endDate: { [Op.gte]: today }
      },
      order: [["startDate", "DESC"]],
      transaction
    });
  }

  /** @deprecated Prefer {@link findCurrentGroupMandate} — mandates are rolling, not calendar-year. */
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
