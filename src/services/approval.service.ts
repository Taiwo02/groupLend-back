import { DbDao } from "../dao/db.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { LoanApprovalDao } from "../dao/loan-approval.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Loan } from "../models/index.js";
import { ApprovalDecision, LoanStatus, MandateStatus } from "../models/enums.js";
import { GroupMemberStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { EmailService } from "../email/email.service.js";
import { NotificationService } from "./notification.service.js";
import { TrustService } from "./trust.service.js";

export class ApprovalService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly loanDao: LoanDao,
    private readonly loanApprovalDao: LoanApprovalDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly userDao: UserDao,
    private readonly trustService: TrustService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService,
    private readonly directDebitMandateDao: DirectDebitMandateDao
  ) {}

  async approveLoan(loanId: string, approverId: string): Promise<Loan> {
    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(loanId, transaction);
      if (!loan) throw new HttpError(404, "Loan not found");
      if (loan.status !== LoanStatus.PENDING_APPROVAL) {
        throw new HttpError(400, "Loan is not pending approval");
      }

      if (loan.groupId) {
        const approverMembership = await this.groupMemberDao.findByGroupAndUser(
          loan.groupId,
          approverId,
          transaction
        );
        if (!approverMembership || approverMembership.status !== GroupMemberStatus.ACTIVE) {
          throw new HttpError(403, "Only active group members can approve; exit request restricts approval");
        }

        // Ensure approver has a running (ACTIVE) direct debit mandate for this group.
        const directMandate = await this.directDebitMandateDao.findByUserAndGroup(
          approverId,
          loan.groupId,
          transaction
        );
        const debitOk =
          directMandate &&
          (directMandate.status === MandateStatus.ACTIVE || directMandate.status === MandateStatus.INPROGRESS) &&
          this.isMandateWithinYear(directMandate.createdAt ?? new Date(0));
        if (!debitOk) {
          throw new HttpError(
            400,
            "You must create and authorize a direct debit mandate for this group in the last 12 months before approving this loan"
          );
        }
      }

      const approval = await this.loanApprovalDao.findByLoanAndApprover(loanId, approverId, transaction);
      if (!approval) throw new HttpError(403, "Approver is not eligible for this loan");

      const respondedAt = new Date();
      await approval.update(
        { decision: ApprovalDecision.APPROVED, respondedAt },
        { transaction }
      );
      await this.trustService.onApprovalResponded(
        approverId,
        loan.createdAt,
        respondedAt,
        transaction
      );

      const pendingCount = await this.loanApprovalDao.countByLoanAndDecision(
        loanId,
        ApprovalDecision.PENDING,
        transaction
      );
      const rejectedCount = await this.loanApprovalDao.countByLoanAndDecision(
        loanId,
        ApprovalDecision.REJECTED,
        transaction
      );

      if (rejectedCount > 0) {
        throw new HttpError(400, "Loan already has a rejected approval");
      }

      if (pendingCount === 0) {
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
      return loan;
    });
  }

  /** Treat mandate as valid for 12 months from creation. */
  private isMandateWithinYear(createdAt: Date): boolean {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    return createdAt >= oneYearAgo;
  }

  async rejectLoan(loanId: string, approverId: string): Promise<Loan> {
    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(loanId, transaction);
      if (!loan) throw new HttpError(404, "Loan not found");
      if (loan.status !== LoanStatus.PENDING_APPROVAL) {
        throw new HttpError(400, "Loan is not pending approval");
      }

      if (loan.groupId) {
        const approverMembership = await this.groupMemberDao.findByGroupAndUser(
          loan.groupId,
          approverId,
          transaction
        );
        if (!approverMembership || approverMembership.status !== GroupMemberStatus.ACTIVE) {
          throw new HttpError(403, "Only active group members can reject; exit request restricts approval");
        }
      }

      const approval = await this.loanApprovalDao.findByLoanAndApprover(loanId, approverId, transaction);
      if (!approval) throw new HttpError(403, "Approver is not eligible for this loan");
      if (approval.decision !== ApprovalDecision.PENDING) {
        throw new HttpError(400, "You have already responded to this loan");
      }

      const respondedAt = new Date();
      await approval.update(
        { decision: ApprovalDecision.REJECTED, respondedAt },
        { transaction }
      );
      await this.trustService.onApprovalResponded(
        approverId,
        loan.createdAt,
        respondedAt,
        transaction
      );

      await loan.update({ status: LoanStatus.REJECTED }, { transaction });
      this.notificationService
        .notifyLoanRejection(loan.borrowerId, Number(loan.amount))
        .catch(() => {});
      const borrower = await this.userDao.findById(loan.borrowerId, transaction);
      if (borrower?.email) {
        this.emailService
          .sendLoanRejection(borrower.email, {
            borrowerName: borrower.fullName,
            amount: Number(loan.amount),
            currency: "NGN"
          })
          .catch(() => {});
      }
      return loan;
    });
  }
}
