import { Transaction } from "sequelize";
import { LoanApproval } from "../models/index.js";
import { ApprovalDecision } from "../models/enums.js";

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
    transaction?: Transaction
  ): Promise<number> {
    return LoanApproval.count({ where: { loanId, decision }, transaction });
  }

  /** Admin override: mark every pending peer approval as approved. */
  approveAllPendingForLoan(loanId: string, transaction: Transaction): Promise<number> {
    const respondedAt = new Date();
    return LoanApproval.update(
      { decision: ApprovalDecision.APPROVED, respondedAt },
      { where: { loanId, decision: ApprovalDecision.PENDING }, transaction }
    ).then(([count]) => count);
  }
}
