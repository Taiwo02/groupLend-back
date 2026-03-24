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

  /** Individual loans: borrower only, no group. */
  findIndividualByBorrowerId(borrowerId: string, transaction?: Transaction): Promise<Loan[]> {
    return Loan.findAll({
      where: { borrowerId, groupId: { [Op.is]: null } },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /** Group loans: borrower with a groupId set. */
  findGroupByBorrowerId(borrowerId: string, transaction?: Transaction): Promise<Loan[]> {
    return Loan.findAll({
      where: { borrowerId, groupId: { [Op.ne]: null } },
      order: [["createdAt", "DESC"]],
      include: [{ association: "group", attributes: ["id", "name"] }],
      transaction
    });
  }

  /** Group loans belonging to provided group ids, optionally filtered by status list. */
  findByGroupIds(
    groupIds: string[],
    statuses?: LoanStatus[],
    transaction?: Transaction
  ): Promise<Loan[]> {
    return Loan.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        ...(statuses && statuses.length > 0 ? { status: { [Op.in]: statuses } } : {})
      },
      order: [["createdAt", "DESC"]],
      include: [
        { association: "group", attributes: ["id", "name"] },
        { association: "borrower", attributes: ["id", "fullName", "email"] }
      ],
      transaction
    });
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

  /** Sum of loan amounts for portfolio value (disbursed, active, repaid, defaulted). */
  async sumPortfolioValue(transaction?: Transaction): Promise<number> {
    const result = await Loan.sum("amount", {
      where: { status: { [Op.in]: DISBURSED_STATUSES } },
      transaction
    });
    return Number(result ?? 0);
  }

  /** Count loans that are active or disbursed. */
  async countActive(transaction?: Transaction): Promise<number> {
    return Loan.count({
      where: { status: { [Op.in]: [LoanStatus.DISBURSED, LoanStatus.ACTIVE] } },
      transaction
    });
  }

  /** Count defaulted loans. */
  async countDefaulted(transaction?: Transaction): Promise<number> {
    return Loan.count({
      where: { status: LoanStatus.DEFAULTED },
      transaction
    });
  }

  /** Count loans by purpose for distribution. */
  async countByPurpose(transaction?: Transaction): Promise<Array<{ loanPurpose: string | null; count: number }>> {
    const loans = await Loan.findAll({
      attributes: ["loanPurpose"],
      where: { status: { [Op.in]: DISBURSED_STATUSES } },
      raw: true,
      transaction
    });
    const map = new Map<string | null, number>();
    for (const row of loans) {
      const p = row.loanPurpose ?? "OTHER";
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([loanPurpose, count]) => ({
      loanPurpose: loanPurpose === "OTHER" ? null : loanPurpose,
      count
    }));
  }

  /**
   * Admin: all loans with filters on createdAt and/or status.
   * `dateTo` is inclusive for the calendar day (end of day UTC boundary using local date string optional — use end of day in query).
   */
  async findForAdminList(
    filters: {
      status?: LoanStatus | LoanStatus[];
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    },
    transaction?: Transaction
  ): Promise<Loan[]> {
    const where: Record<string, unknown> = {};
    if (filters.status !== undefined) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (statuses.length > 0) where.status = { [Op.in]: statuses };
    }
    if (filters.dateFrom || filters.dateTo) {
      const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
      if (filters.dateFrom) range[Op.gte] = filters.dateFrom;
      if (filters.dateTo) {
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        range[Op.lte] = end;
      }
      where.createdAt = range;
    }
    return Loan.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: filters.limit ?? 100,
      offset: filters.offset ?? 0,
      include: [
        { association: "borrower", attributes: ["id", "fullName", "email"] },
        { association: "group", attributes: ["id", "name"], required: false },
        { association: "approvals", required: false }
      ],
      transaction
    });
  }

  async countForAdminList(
    filters: {
      status?: LoanStatus | LoanStatus[];
      dateFrom?: Date;
      dateTo?: Date;
    },
    transaction?: Transaction
  ): Promise<number> {
    const where: Record<string, unknown> = {};
    if (filters.status !== undefined) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (statuses.length > 0) where.status = { [Op.in]: statuses };
    }
    if (filters.dateFrom || filters.dateTo) {
      const range: { [Op.gte]?: Date; [Op.lte]?: Date } = {};
      if (filters.dateFrom) range[Op.gte] = filters.dateFrom;
      if (filters.dateTo) {
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        range[Op.lte] = end;
      }
      where.createdAt = range;
    }
    return Loan.count({ where, transaction });
  }

  /** Recent loans with borrower, for admin dashboard. */
  async findRecentWithBorrower(
    limit: number,
    transaction?: Transaction
  ): Promise<Array<Loan & { borrower?: { fullName: string } }>> {
    const list = await Loan.findAll({
      where: {},
      order: [["createdAt", "DESC"]],
      limit,
      include: [{ association: "borrower", attributes: ["fullName"] }],
      transaction
    });
    return list as Array<Loan & { borrower?: { fullName: string } }>;
  }

  /** Portfolio growth: sum of loan amounts by week for the last 30 days (for charts). */
  async getPortfolioGrowthByWeek(transaction?: Transaction): Promise<Array<{ weekLabel: string; total: number }>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const loans = await Loan.findAll({
      attributes: ["amount", "createdAt"],
      where: {
        createdAt: { [Op.gte]: thirtyDaysAgo },
        status: { [Op.in]: DISBURSED_STATUSES }
      },
      raw: true,
      transaction
    });
    const weekBuckets: number[] = [0, 0, 0, 0];
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    for (const row of loans) {
      const created = new Date(row.createdAt).getTime();
      const weeksAgo = Math.floor((now - created) / oneWeek);
      const index = Math.min(3 - weeksAgo, 3);
      if (index >= 0) {
        weekBuckets[index] += Number(row.amount);
      }
    }
    return weekBuckets.map((total, i) => ({
      weekLabel: `WEEK ${i + 1}`,
      total
    }));
  }
}
