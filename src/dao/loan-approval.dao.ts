import { Transaction } from "sequelize";
import { LoanApproval } from "../models";
import { ApprovalDecision } from "../models/enums";

export class LoanApprovalDao {
  createPendingApprovals(
    approvals: Array<{ loanId: string; approverId: string; decision: ApprovalDecision }>,
    transaction: Transaction
  ): Promise<LoanApproval[]> {
    return LoanApproval.bulkCreate(approvals, { transaction });
  }

  findByLoanAndApprover(
    loanId: string,
    approverId: string,
    transaction?: Transaction
  ): Promise<LoanApproval | null> {
    return LoanApproval.findOne({ where: { loanId, approverId }, transaction });
  }

  countByLoanAndDecision(
    loanId: string,
    decision: ApprovalDecision,
    transaction: Transaction
  ): Promise<number> {
    return LoanApproval.count({ where: { loanId, decision }, transaction });
  }
}
