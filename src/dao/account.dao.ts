import { Transaction } from "sequelize";
import { Account, Mandate, UserMandate } from "../models/index.js";
import { AccountStatus } from "../models/enums.js";

export class AccountDao {
  create(
    payload: {
      /** Set for group member accounts. */
      mandateId?: string | null;
      /** Set for individual user accounts. */
      userMandateId?: string | null;
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
        mandateId: payload.mandateId ?? null,
        userMandateId: payload.userMandateId ?? null,
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

  /** Eager-load group Mandate. Use for group member accounts. */
  findByIdWithMandate(id: string, transaction?: Transaction): Promise<Account | null> {
    return Account.findByPk(id, {
      include: [{ model: Mandate, as: "mandate", required: false }],
      transaction
    });
  }

  /** Eager-load UserMandate. Use for individual user accounts. */
  findByIdWithUserMandate(id: string, transaction?: Transaction): Promise<Account | null> {
    return Account.findByPk(id, {
      include: [{ model: UserMandate, as: "userMandate", required: false }],
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

  /** Saved debit accounts for a member mandate, newest first. */
  findByMemberMandateIdOrderByCreatedDesc(
    memberMandateId: string,
    transaction?: Transaction
  ): Promise<Account[]> {
    return Account.findAll({
      where: { memberMandateId },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /** Saved direct-debit accounts for an individual user mandate, newest first. */
  findByUserMandateIdOrderByCreatedDesc(
    userMandateId: string,
    transaction?: Transaction
  ): Promise<Account[]> {
    return Account.findAll({
      where: { userMandateId },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  findActiveByUserMandateId(
    userMandateId: string,
    transaction?: Transaction
  ): Promise<Account[]> {
    return Account.findAll({
      where: { userMandateId, status: AccountStatus.ACTIVE },
      transaction
    });
  }
}
