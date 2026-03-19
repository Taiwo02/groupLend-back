import { Transaction } from "sequelize";
import { Account, Mandate } from "../models/index.js";
import { AccountStatus } from "../models/enums.js";

export class AccountDao {
  create(
    payload: {
      mandateId: string;
      memberMandateId?: string | null;
      reference?: string | null;
      monoCustomerId?: string | null;
      accountNumber?: string | null;
      bankCode?: string | null;
      isRequired?: boolean;
      status?: AccountStatus;
      mandateData?: Record<string, unknown>;
      initiateMandateData?: Record<string, unknown>;
    },
    transaction?: Transaction
  ): Promise<Account> {
    return Account.create(
      {
        ...payload,
        mandateData: payload.mandateData ?? {},
        initiateMandateData: payload.initiateMandateData ?? {},
        isRequired: payload.isRequired ?? false,
        status: payload.status ?? AccountStatus.INACTIVE
      },
      { transaction: transaction ?? undefined }
    );
  }

  findById(id: string, transaction?: Transaction): Promise<Account | null> {
    return Account.findByPk(id, { transaction });
  }

  findByIdWithMandate(id: string, transaction?: Transaction): Promise<Account | null> {
    return Account.findByPk(id, {
      include: [{ model: Mandate, as: "mandate", required: true }],
      transaction
    });
  }

  findAllByMandateId(mandateId: string, transaction?: Transaction): Promise<Account[]> {
    return Account.findAll({ where: { mandateId }, transaction });
  }

  async updateMandateInitiation(
    id: string,
    fields: {
      reference: string;
      initiateMandateData: Record<string, unknown>;
    },
    transaction?: Transaction
  ): Promise<void> {
    const now = new Date();
    await Account.update(
      {
        reference: fields.reference,
        initiateMandateData: fields.initiateMandateData,
        createdAt: now,
        updatedAt: now
      },
      { where: { id }, transaction }
    );
  }

  async updateStatus(
    id: string,
    status: AccountStatus,
    transaction?: Transaction
  ): Promise<void> {
    await Account.update({ status, updatedAt: new Date() }, { where: { id }, transaction });
  }

  findActiveByMemberMandateId(
    memberMandateId: string,
    transaction?: Transaction
  ): Promise<Account | null> {
    return Account.findOne({
      where: { memberMandateId, status: AccountStatus.ACTIVE },
      transaction
    });
  }

  /** Active accounts for a mandate (for recovery debit: pick another member's account). */
  findActiveByMandateId(
    mandateId: string,
    transaction?: Transaction
  ): Promise<Account[]> {
    return Account.findAll({
      where: { mandateId, status: AccountStatus.ACTIVE },
      transaction
    });
  }

  findByMemberMandateId(
    memberMandateId: string,
    transaction?: Transaction
  ): Promise<Account[]> {
    return Account.findAll({ where: { memberMandateId }, transaction });
  }
}
