import { Transaction } from "sequelize";
import { MemberMandate } from "../models/index.js";
import { MandateStatus } from "../models/enums.js";

export class MemberMandateDao {
  create(
    payload: { mandateId: string; userId: string; status?: MandateStatus },
    transaction?: Transaction
  ): Promise<MemberMandate> {
    return MemberMandate.create(
      { ...payload, status: payload.status ?? MandateStatus.ACTIVE },
      { transaction: transaction ?? undefined }
    );
  }

  findByMandateAndUser(
    mandateId: string,
    userId: string,
    transaction?: Transaction
  ): Promise<MemberMandate | null> {
    return MemberMandate.findOne({
      where: { mandateId, userId },
      transaction
    });
  }

  findActiveByMandateId(
    mandateId: string,
    transaction?: Transaction
  ): Promise<MemberMandate[]> {
    return MemberMandate.findAll({
      where: { mandateId, status: MandateStatus.ACTIVE },
      transaction
    });
  }

  findAllByMandateId(mandateId: string, transaction?: Transaction): Promise<MemberMandate[]> {
    return MemberMandate.findAll({ where: { mandateId }, transaction });
  }
}
