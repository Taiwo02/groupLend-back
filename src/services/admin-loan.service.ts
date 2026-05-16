import { DbDao } from "../dao/db.dao.js";
import type { AdminLoanOperationsTab } from "../dao/loan.dao.js";
import { LoanApprovalDao } from "../dao/loan-approval.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { EmailService } from "../email/email.service.js";
import { Loan, LoanApproval, Repayment } from "../models/index.js";
import { ApprovalDecision, LoanStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { LoanService } from "./loan.service.js";
import { NotificationService } from "./notification.service.js";
import { toNumber } from "../utils/number.js";

const ADMIN_TRANSITION_STATUSES = new Set<LoanStatus>([
  LoanStatus.APPROVED,
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

const PENDING_DISBURSEMENT_STATUSES: LoanStatus[] = [LoanStatus.APPROVED, LoanStatus.PROCESSING];

export type AdminLoanOperationsSummary = {
  totalActiveLoans: number;
  totalActiveLoansChangePercent: number;
  pendingDisbursementsValue: number;
  pendingDisbursementsChangePercent: number;
  repaymentRatePercent: number;
  repaymentRateChangePercent: number;
  totalPortfolioValue: number;
  totalPortfolioValueChangePercent: number;
};

export type AdminLoanOperationsRow = {
  id: string;
  displayId: string;
  displayName: string;
  borrowerName: string;
  borrowerId: string;
  isGroupLoan: boolean;
  group: { id: string; name: string } | null;
  amount: number;
  status: LoanStatus;
  disbursementReadiness: "FULLY_APPROVED" | "AWAITING_PIN" | null;
  dateApproved: string | null;
  canDisburse: boolean;
  createdAt: string;
  updatedAt: string;
  repayments?: Array<{
    id: string;
    dueDate: string;
    amount: number;
    status: string;
  }>;
};

export function formatAdminLoanDisplayId(loan: { id: string; groupId: string | null }): string {
  const compact = loan.id.replace(/-/g, "").toUpperCase();
  const n = parseInt(compact.slice(0, 8), 16) % 10000;
  const suffix = loan.groupId ? "G" : "X";
  return `LN-${String(n).padStart(4, "0")}-${suffix}`;
}

function computeDateApprovedIso(approvals: LoanApproval[] | undefined): string | null {
  if (!approvals?.length) return null;
  const times = approvals
    .filter((a) => a.decision === ApprovalDecision.APPROVED && a.respondedAt)
    .map((a) => new Date(a.respondedAt!).getTime());
  if (times.length === 0) return null;
  return new Date(Math.max(...times)).toISOString();
}

export class AdminLoanService {
  constructor(
    private readonly loanDao: LoanDao,
    private readonly dbDao: DbDao,
    private readonly loanService: LoanService,
    private readonly userDao: UserDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly loanApprovalDao: LoanApprovalDao,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService
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
      throw new HttpError(400, "Status must be APPROVED, REVIEWING, PROCESSING, or DISBURSED", {
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
        if (loan.status !== LoanStatus.PENDING_APPROVAL) {
          throw new HttpError(400, "Can only move to REVIEWING from PENDING_APPROVAL", {
            currentStatus: loan.status
          });
        }
        await loan.update({ status: LoanStatus.REVIEWING }, { transaction });
        await loan.reload({ transaction });
        return loan;
      }

      if (status === LoanStatus.APPROVED) {
        if (
          loan.status !== LoanStatus.PENDING_APPROVAL &&
          loan.status !== LoanStatus.REVIEWING
        ) {
          throw new HttpError(400, "Can only move to APPROVED from PENDING_APPROVAL or REVIEWING", {
            currentStatus: loan.status
          });
        }
        const rejectedCount = await this.loanApprovalDao.countByLoanAndDecision(
          loanId,
          ApprovalDecision.REJECTED,
          transaction
        );
        if (rejectedCount > 0) {
          throw new HttpError(400, "Loan has a rejected approval");
        }
        if (loan.status === LoanStatus.PENDING_APPROVAL) {
          await this.loanApprovalDao.approveAllPendingForLoan(loanId, transaction);
        }
        await loan.update({ status: LoanStatus.APPROVED }, { transaction });
        await loan.reload({ transaction });
        this.notificationService
          .notifyLoanApproval(loan.borrowerId, Number(loan.amount))
          .catch(() => {});
        const borrower = await this.userDao.findById(loan.borrowerId, transaction);
        if (borrower?.email) {
          this.emailService
            .sendLoanApproval(borrower.email, {
              borrowerName: borrower.fullName,
              amount: Number(loan.amount),
              currency: "NGN"
            })
            .catch(() => {});
        }
        return loan;
      }

      if (status === LoanStatus.PROCESSING) {
        if (loan.status !== LoanStatus.APPROVED) {
          throw new HttpError(400, "Can only move to PROCESSING from APPROVED", {
            currentStatus: loan.status
          });
        }
        await loan.update({ status: LoanStatus.PROCESSING }, { transaction });
        await loan.reload({ transaction });
        return loan;
      }

      // DISBURSED — run disburse pipeline
      if (loan.status !== LoanStatus.APPROVED && loan.status !== LoanStatus.PROCESSING) {
        throw new HttpError(400, "Can only disburse from APPROVED or PROCESSING", {
          currentStatus: loan.status
        });
      }
      return this.loanService.disburseLoan(loanId, transaction);
    });
  }

  /** Borrower must have set loan PIN; runs the same pipeline as PATCH …/status DISBURSED. */
  async executeDisbursement(loanId: string): Promise<Loan> {
    const loan = await this.loanDao.findById(loanId);
    if (!loan) throw new HttpError(404, "Loan not found");
    const borrower = await this.userDao.findById(loan.borrowerId);
    if (!borrower?.loanPinHash) {
      throw new HttpError(
        400,
        "Borrower must set a loan PIN before disbursement can be executed"
      );
    }
    return this.setLoanStatus(loanId, LoanStatus.DISBURSED);
  }

  async getLoanOperationsSummary(): Promise<AdminLoanOperationsSummary> {
    const [
      totalActiveLoans,
      pendingDisbursementsValue,
      totalPortfolioValue,
      repaymentCounts
    ] = await Promise.all([
      this.loanDao.countByStatuses([LoanStatus.ACTIVE]),
      this.loanDao.sumAmountByStatuses(PENDING_DISBURSEMENT_STATUSES),
      this.loanDao.sumPortfolioValue(),
      this.repaymentDao.countTotalAndPaid()
    ]);
    const { total: repaymentTotal, paid: repaymentPaid } = repaymentCounts;
    const repaymentRatePercent =
      repaymentTotal > 0 ? Math.round((repaymentPaid / repaymentTotal) * 1000) / 10 : 100;
    return {
      totalActiveLoans,
      totalActiveLoansChangePercent: 0,
      pendingDisbursementsValue,
      pendingDisbursementsChangePercent: 0,
      repaymentRatePercent,
      repaymentRateChangePercent: 0,
      totalPortfolioValue,
      totalPortfolioValueChangePercent: 0
    };
  }

  async listLoanOperations(params: {
    tab: AdminLoanOperationsTab;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ loans: AdminLoanOperationsRow[]; total: number; tab: AdminLoanOperationsTab }> {
    const limit = Math.min(params.limit ?? 10, 100);
    const offset = Math.max(0, params.offset ?? 0);
    const [rows, total] = await Promise.all([
      this.loanDao.findForAdminOperations({
        tab: params.tab,
        q: params.q,
        limit,
        offset
      }),
      this.loanDao.countForAdminOperations({ tab: params.tab, q: params.q })
    ]);
    return {
      loans: rows.map((l) => this.serializeOperationsRow(l, params.tab)),
      total,
      tab: params.tab
    };
  }

  private serializeOperationsRow(loan: Loan, tab: AdminLoanOperationsTab): AdminLoanOperationsRow {
    const raw = loan.toJSON() as Record<string, unknown>;
    const borrower = raw.borrower as
      | { id: string; fullName: string; email: string; loanPinHash?: string | null }
      | undefined;
    const group = raw.group as { id: string; name: string } | null | undefined;
    const hasPin = !!borrower?.loanPinHash;
    const isPending = PENDING_DISBURSEMENT_STATUSES.includes(loan.status);
    const approvals = (loan as Loan & { approvals?: LoanApproval[] }).approvals;

    const repaymentsRaw = (loan as Loan & { repayments?: Repayment[] }).repayments;
    const repayments =
      tab === "repayment_schedule" && Array.isArray(repaymentsRaw)
        ? repaymentsRaw.map((r) => ({
            id: r.id,
            dueDate: r.dueDate.toISOString(),
            amount: toNumber(r.amount),
            status: r.status
          }))
        : undefined;

    return {
      id: loan.id,
      displayId: formatAdminLoanDisplayId(loan),
      displayName: group?.name ?? borrower?.fullName ?? "Unknown",
      borrowerName: borrower?.fullName ?? "Unknown",
      borrowerId: loan.borrowerId,
      isGroupLoan: !!loan.groupId,
      group: group ? { id: group.id, name: group.name } : null,
      amount: toNumber(loan.amount),
      status: loan.status,
      disbursementReadiness: isPending
        ? hasPin
          ? "FULLY_APPROVED"
          : "AWAITING_PIN"
        : null,
      dateApproved: computeDateApprovedIso(approvals),
      canDisburse: isPending && hasPin && !!loan.groupId,
      createdAt: loan.createdAt.toISOString(),
      updatedAt: loan.updatedAt.toISOString(),
      repayments
    };
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
