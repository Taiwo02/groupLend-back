import { Transaction } from "sequelize";
import { GroupDao } from "../dao/group.dao";
import { LoanDao } from "../dao/loan.dao";
import { RepaymentDao } from "../dao/repayment.dao";
import { LoanStatus, RepaymentStatus } from "../models/enums";
import { toNumber } from "../utils/number";

type QuarterPerformance = "perfect" | "minor_delay" | "default";

export class QuarterlyService {
  constructor(
    private readonly groupDao: GroupDao,
    private readonly loanDao: LoanDao,
    private readonly repaymentDao: RepaymentDao
  ) {}

  /**
   * Run quarterly review for all groups whose quarter has ended.
   * Adjusts currentCreditPool: perfect +20%, minor_delay maintain, default -30%.
   * Resets quarterly dates to next quarter.
   */
  async runQuarterlyGroupReview(): Promise<{ processed: number }> {
    const now = new Date();
    const groups = await this.groupDao.findAll();
    let processed = 0;

    for (const group of groups) {
      const end = group.quarterlyEndDate ? new Date(group.quarterlyEndDate) : null;
      if (!end || end > now) continue;

      const start = group.quarterlyStartDate ? new Date(group.quarterlyStartDate) : null;
      if (!start) continue;

      const performance = await this.evaluateGroupPerformance(
        group.id,
        start,
        end
      );

      const currentPool = toNumber(group.currentCreditPool);
      let newPool: number;
      if (performance === "default") {
        newPool = Math.max(0, currentPool * 0.7);
      } else if (performance === "perfect") {
        newPool = currentPool * 1.2;
      } else {
        newPool = currentPool;
      }

      const nextStart = new Date(end);
      nextStart.setDate(1);
      const nextEnd = new Date(nextStart);
      nextEnd.setMonth(nextEnd.getMonth() + 3);
      nextEnd.setDate(0);

      await this.groupDao.updateQuarterAndPool(group.id, {
        currentCreditPool: Number(newPool.toFixed(2)),
        quarterlyStartDate: nextStart,
        quarterlyEndDate: nextEnd
      });
      processed++;
    }

    return { processed };
  }

  private async evaluateGroupPerformance(
    groupId: string,
    start: Date,
    end: Date
  ): Promise<QuarterPerformance> {
    const loans = await this.loanDao.findByGroupId(groupId);
    const loanIds = loans.map((l) => l.id);

    const hasDefault = loans.some((l) => l.status === LoanStatus.DEFAULTED);
    if (hasDefault) return "default";

    if (loanIds.length === 0) return "perfect";

    const repayments = await this.repaymentDao.findByLoanIdsAndDueDateRange(
      loanIds,
      start,
      end
    );
    const hasLate = repayments.some(
      (r) => r.status === RepaymentStatus.LATE || (r.paidAt && r.paidAt > r.dueDate)
    );
    if (hasLate) return "minor_delay";

    return "perfect";
  }
}
