import { Transaction } from "sequelize";
import { Loan } from "../models";
import { LoanStatus } from "../models/enums";

export class LoanDao {
  createLoan(
    payload: {
      borrowerId: string;
      groupId: string | null;
      amount: number;
      interestRate: number;
      tenorMonths: number;
      loanPurpose?: import("../models/enums").LoanPurpose | null;
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
      include: [{ association: "approvals" }, { association: "repayments" }, { association: "group" }]
    });
  }

  findByGroupId(groupId: string, transaction?: Transaction): Promise<Loan[]> {
    return Loan.findAll({ where: { groupId }, transaction });
  }
}
