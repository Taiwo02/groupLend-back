import { DbDao } from "../dao/db.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { Loan } from "../models/index.js";
import { LoanStatus, RepaymentStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";
import { TrustService } from "./trust.service.js";

export type RecordRepaymentInput = {
  loanId: string;
  amount: number;
  userId: string;
};

export class RepaymentService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly loanDao: LoanDao,
    private readonly groupDao: GroupDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly trustService: TrustService
  ) {}

  async recordRepayment(input: RecordRepaymentInput): Promise<Loan> {
    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(input.loanId, transaction);
      if (!loan) throw new HttpError(404, "Loan not found");
      if (loan.borrowerId !== input.userId) {
        throw new HttpError(403, "Only the borrower can record repayments for this loan");
      }
      if (![LoanStatus.ACTIVE, LoanStatus.DISBURSED].includes(loan.status)) {
        throw new HttpError(400, "Loan is not repayable in current status");
      }

      const currentOutstanding = toNumber(loan.outstandingBalance);
      if (input.amount <= 0 || input.amount > currentOutstanding) {
        throw new HttpError(400, "Invalid repayment amount");
      }

      let remaining = input.amount;
      const unpaidSchedules = await this.repaymentDao.findUnpaidByLoanId(loan.id, transaction);

      for (const schedule of unpaidSchedules) {
        if (remaining <= 0) break;
        const installment = toNumber(schedule.amount);
        if (remaining >= installment) {
          remaining -= installment;
          await schedule.update(
            { status: RepaymentStatus.PAID, paidAt: new Date() },
            { transaction }
          );
        }
      }

      const nextOutstanding = Math.max(0, Number((currentOutstanding - input.amount).toFixed(2)));
      const nextStatus = nextOutstanding === 0 ? LoanStatus.REPAID : LoanStatus.ACTIVE;
      await loan.update({ outstandingBalance: nextOutstanding, status: nextStatus }, { transaction });

      await this.trustService.onRepaymentRecorded(
        loan.borrowerId,
        loan.groupId,
        transaction
      );

      if (loan.groupId) {
        const group = await this.groupDao.findById(loan.groupId, transaction);
        if (!group) throw new HttpError(404, "Group not found");
        const newPool = toNumber(group.currentCreditPool) + input.amount;
        await group.update({ currentCreditPool: newPool }, { transaction });
      }

      return loan;
    });
  }
}
