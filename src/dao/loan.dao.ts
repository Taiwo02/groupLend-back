import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { Loan } from "../models/index.js";
import { LoanStatus } from "../models/enums.js";

const DISBURSED_STATUSES = [LoanStatus.DISBURSED, LoanStatus.ACTIVE, LoanStatus.REPAID, LoanStatus.DEFAULTED];

export class LoanDao {
  createLoan(
    payload: {
      borrowerId: string;
      groupId: string | null;
      mandateId?: string | null;
      amount: number;
      interestRate: number;
      tenorMonths: number;
      loanPurpose?: import("../models/enums.js").LoanPurpose | null;
      status: LoanStatus;
      outstandingBalance: number;
    },
    transaction: Transaction
  ): Promise<Loan> {
    return Loan.create(payload, { transaction });
  }

  findById(id: string, transaction?: Transaction): Promise<Loan | null> {
    return Loan.findByPk(id, { transaction });
  }

  getLoanWithRelations(id: string): Promise<Loan | null> {
    return Loan.findByPk(id, {
      include: [
        { association: "approvals" },
        { association: "repayments" },
        { association: "group" },
        { association: "mandate" }
      ]
    });
  }

  findByGroupId(groupId: string, transaction?: Transaction): Promise<Loan[]> {
    return Loan.findAll({ where: { groupId }, transaction });
  }

  /** Sum of principal amounts of loans under this mandate that are disbursed/active/repaid/defaulted. */
  async sumDisbursedAmountByMandateId(
    mandateId: string,
    transaction?: Transaction
  ): Promise<number> {
    const result = await Loan.sum("amount", {
      where: { mandateId, status: { [Op.in]: DISBURSED_STATUSES } },
      transaction
    });
    return Number(result ?? 0);
  }
}
