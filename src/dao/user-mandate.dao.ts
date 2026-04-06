import { Op, Transaction } from "sequelize";
import { UserMandate } from "../models/user-mandate.model.js";
import { GroupMandateStatus } from "../models/enums.js";
import { toLocalDateYmd } from "../utils/mandate-period.js";

export class UserMandateDao {
  create(
    payload: {
      userId: string;
      year: number;
      totalAccessAmount: number;
      startDate: Date;
      endDate: Date;
      status?: GroupMandateStatus;
    },
    transaction?: Transaction
  ): Promise<UserMandate> {
    return UserMandate.create(
      { ...payload, status: payload.status ?? GroupMandateStatus.ACTIVE },
      { transaction: transaction ?? undefined }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<UserMandate | null> {
    return UserMandate.findByPk(id, { transaction });
  }

  /**
   * Mark ACTIVE user mandates whose period has ended (endDate strictly before today).
   */
  async expireForUser(userId: string, transaction?: Transaction): Promise<void> {
    const today = toLocalDateYmd(new Date());
    await UserMandate.update(
      { status: GroupMandateStatus.EXPIRED },
      {
        where: {
          userId,
          status: GroupMandateStatus.ACTIVE,
          endDate: { [Op.lt]: today }
        },
        transaction
      }
    );
  }

  /**
   * Current individual mandate: ACTIVE and period not ended (endDate >= today).
   */
  findCurrentForUser(userId: string, transaction?: Transaction): Promise<UserMandate | null> {
    const today = toLocalDateYmd(new Date());
    return UserMandate.findOne({
      where: {
        userId,
        status: GroupMandateStatus.ACTIVE,
        endDate: { [Op.gte]: today }
      },
      order: [["startDate", "DESC"]],
      transaction
    });
  }

  findByUserId(userId: string, transaction?: Transaction): Promise<UserMandate[]> {
    return UserMandate.findAll({
      where: { userId },
      order: [["year", "DESC"]],
      transaction
    });
  }
}
