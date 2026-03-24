import { Op, Transaction } from "sequelize";
import { Loan, Repayment } from "../models/index.js";
import { RepaymentStatus } from "../models/enums.js";

export class RepaymentDao {
  countByLoanId(loanId: string, transaction: Transaction): Promise<number> {
    return Repayment.count({ where: { loanId }, transaction });
  }

  /** Count PAID repayments across all loans for a borrower (for "X successful repayments" badge). */
  async countPaidByBorrowerId(borrowerId: string, transaction?: Transaction): Promise<number> {
    const count = await Repayment.count({
      where: { status: RepaymentStatus.PAID },
      include: [{ model: Loan, as: "loan", where: { borrowerId: borrowerId }, required: true, attributes: [] }],
      transaction
    });
    return count;
  }

  createSchedule(
    schedule: Array<{
      loanId: string;
      amount: number;
      dueDate: Date;
      status: RepaymentStatus;
    }>,
    transaction: Transaction
  ): Promise<Repayment[]> {
    return Repayment.bulkCreate(schedule, { transaction });
  }

  findUnpaidByLoanId(loanId: string, transaction: Transaction): Promise<Repayment[]> {
    return Repayment.findAll({
      where: {
        loanId,
        status: {
          [Op.in]: [RepaymentStatus.DUE, RepaymentStatus.LATE]
        }
      },
      order: [["dueDate", "ASC"]],
      transaction
    });
  }

  /** Repayments for given loan IDs with dueDate in [start, end]. */
  findByLoanIdsAndDueDateRange(
    loanIds: string[],
    start: Date,
    end: Date,
    transaction?: Transaction
  ): Promise<Repayment[]> {
    if (loanIds.length === 0) return Promise.resolve([]);
    return Repayment.findAll({
      where: {
        loanId: { [Op.in]: loanIds },
        dueDate: { [Op.gte]: start, [Op.lte]: end }
      },
      transaction
    });
  }

  /** For admin loan dashboard repayment-rate KPI. */
  async countTotalAndPaid(transaction?: Transaction): Promise<{ total: number; paid: number }> {
    const [total, paid] = await Promise.all([
      Repayment.count({ transaction }),
      Repayment.count({ where: { status: RepaymentStatus.PAID }, transaction })
    ]);
    return { total, paid };
  }
}
