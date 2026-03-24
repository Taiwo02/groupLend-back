import { DbDao } from "../dao/db.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { Loan } from "../models/index.js";
import { LoanStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { LoanService } from "./loan.service.js";
import { toNumber } from "../utils/number.js";

const ADMIN_TRANSITION_STATUSES = new Set<LoanStatus>([
  LoanStatus.REVIEWING,
  LoanStatus.PROCESSING,
  LoanStatus.DISBURSED
]);

export type AdminLoanListItem = {
  id: string;
  borrowerId: string;
  groupId: string | null;
  mandateId: string | null;
  amount: number;
  interestRate: number;
  tenorMonths: number;
  loanPurpose: string | null;
  status: LoanStatus;
  outstandingBalance: number;
  createdAt: string;
  updatedAt: string;
  borrower?: { id: string; fullName: string; email: string };
  group?: { id: string; name: string } | null;
  approvals?: Array<{ approverId: string; decision: string; respondedAt: string | null }>;
};

export class AdminLoanService {
  constructor(
    private readonly loanDao: LoanDao,
    private readonly dbDao: DbDao,
    private readonly loanService: LoanService
  ) {}

  async listLoanRequests(params: {
    status?: LoanStatus[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ loans: AdminLoanListItem[]; total: number }> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = Math.max(0, params.offset ?? 0);
    const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined;
    const dateTo = params.dateTo ? new Date(params.dateTo) : undefined;
    if (dateFrom && Number.isNaN(dateFrom.getTime())) throw new HttpError(400, "Invalid dateFrom");
    if (dateTo && Number.isNaN(dateTo.getTime())) throw new HttpError(400, "Invalid dateTo");

    const loans = await this.loanDao.findForAdminList(
      {
        status: params.status && params.status.length > 0 ? params.status : undefined,
        dateFrom,
        dateTo,
        limit,
        offset
      }
    );

    const total = await this.loanDao.countForAdminList({
      status: params.status && params.status.length > 0 ? params.status : undefined,
      dateFrom,
      dateTo
    });

    return {
      loans: loans.map((l) => this.serializeLoan(l)),
      total
    };
  }

  /**
   * Admin moves a group loan through internal review/disbursement.
   * DISBURSED runs the same disbursement flow as the old auto-disburse (schedule, pool debit, ACTIVE).
   */
  async setLoanStatus(loanId: string, status: LoanStatus): Promise<Loan> {
    if (!ADMIN_TRANSITION_STATUSES.has(status)) {
      throw new HttpError(400, "Status must be REVIEWING, PROCESSING, or DISBURSED", {
        allowed: [...ADMIN_TRANSITION_STATUSES]
      });
    }

    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(loanId, transaction);
      if (!loan) throw new HttpError(404, "Loan not found");
      if (!loan.groupId) {
        throw new HttpError(400, "Only group loans support admin review / disbursement workflow");
      }

      if (status === LoanStatus.REVIEWING) {
        if (loan.status !== LoanStatus.APPROVED) {
          throw new HttpError(400, "Can only move to REVIEWING from APPROVED", { currentStatus: loan.status });
        }
        await loan.update({ status: LoanStatus.REVIEWING }, { transaction });
        await loan.reload({ transaction });
        return loan;
      }

      if (status === LoanStatus.PROCESSING) {
        if (loan.status !== LoanStatus.APPROVED && loan.status !== LoanStatus.REVIEWING) {
          throw new HttpError(400, "Can only move to PROCESSING from APPROVED or REVIEWING", {
            currentStatus: loan.status
          });
        }
        await loan.update({ status: LoanStatus.PROCESSING }, { transaction });
        await loan.reload({ transaction });
        return loan;
      }

      // DISBURSED — run disburse pipeline
      if (
        loan.status !== LoanStatus.APPROVED &&
        loan.status !== LoanStatus.REVIEWING &&
        loan.status !== LoanStatus.PROCESSING
      ) {
        throw new HttpError(400, "Can only disburse from APPROVED, REVIEWING, or PROCESSING", {
          currentStatus: loan.status
        });
      }
      return this.loanService.disburseLoan(loanId, transaction);
    });
  }

  private serializeLoan(loan: Loan): AdminLoanListItem {
    const raw = loan.toJSON() as Record<string, unknown>;
    const approvals = Array.isArray(raw.approvals)
      ? (raw.approvals as Record<string, unknown>[]).map((a) => ({
          approverId: String(a.approverId ?? ""),
          decision: String(a.decision ?? ""),
          respondedAt: a.respondedAt
            ? new Date(a.respondedAt as string).toISOString()
            : null
        }))
      : undefined;
    return {
      id: loan.id,
      borrowerId: loan.borrowerId,
      groupId: loan.groupId,
      mandateId: loan.mandateId ?? null,
      amount: toNumber(loan.amount),
      interestRate: toNumber(loan.interestRate),
      tenorMonths: loan.tenorMonths,
      loanPurpose: loan.loanPurpose ?? null,
      status: loan.status,
      outstandingBalance: toNumber(loan.outstandingBalance),
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      borrower: (raw.borrower as AdminLoanListItem["borrower"]) ?? undefined,
      group: raw.group
        ? { id: (raw.group as { id: string }).id, name: (raw.group as { name: string }).name }
        : null,
      approvals
    };
  }
}
