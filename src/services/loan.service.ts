import { Transaction } from "sequelize";
import { DbDao } from "../dao/db.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanApprovalDao } from "../dao/loan-approval.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Loan } from "../models/index.js";
import {
  ApprovalDecision,
  CredibilityLevel,
  GroupMemberStatus,
  LoanPurpose,
  LoanStatus,
  MandateStatus,
  RepaymentStatus
} from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";
import { EmailService } from "../email/email.service.js";
import { NotificationService } from "./notification.service.js";

export type LoanRequestInput = {
  borrowerId: string;
  amount: number;
  interestRate: number;
  tenorMonths: number;
  loanPurpose?: LoanPurpose | null;
};

export type GroupLoanRequestInput = LoanRequestInput & {
  groupId: string;
};

export class LoanService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly userDao: UserDao,
    private readonly groupDao: GroupDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly loanDao: LoanDao,
    private readonly loanApprovalDao: LoanApprovalDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly directDebitMandateDao: DirectDebitMandateDao,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService
  ) {}

  async requestIndividualLoan(input: LoanRequestInput): Promise<Loan> {
    const borrower = await this.userDao.findById(input.borrowerId);
    if (!borrower) throw new HttpError(404, "Borrower not found");

    const availableLimit = toNumber(borrower.creditLimit);
    if (input.amount > availableLimit) throw new HttpError(400, "Amount exceeds credit limit");

    return this.dbDao.withTransaction(async (transaction) => {
      const totalPayable = this.computeTotalPayable(input.amount, input.interestRate, input.tenorMonths);
      const loan = await this.loanDao.createLoan(
        {
          borrowerId: input.borrowerId,
          groupId: null,
          amount: input.amount,
          interestRate: input.interestRate,
          tenorMonths: input.tenorMonths,
          loanPurpose: input.loanPurpose ?? null,
          status: LoanStatus.ACTIVE,
          outstandingBalance: totalPayable
        },
        transaction
      );

      await this.generateRepaymentSchedule(loan, transaction);
      return loan;
    });
  }

  async requestGroupLoan(input: GroupLoanRequestInput): Promise<Loan> {
    const group = await this.groupDao.findById(input.groupId);
    if (!group) throw new HttpError(404, "Group not found");

    const borrowerMembership = await this.groupMemberDao.findByGroupAndUser(
      input.groupId,
      input.borrowerId
    );
    if (!borrowerMembership) throw new HttpError(403, "You are not a member of this group");
    if (borrowerMembership.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "Only active members can request a group loan");
    }

    const activeMembers = await this.groupMemberDao.findActiveMembersByGroupId(input.groupId);
    if (!activeMembers.length) throw new HttpError(400, "No active group members");

    const currentPool = toNumber(group.currentCreditPool);
    const isInstitutional =
      group.credibilityLevel === CredibilityLevel.VERIFIED_TRUST_GROUP && input.amount > currentPool;

    if (!isInstitutional && input.amount > currentPool) {
      throw new HttpError(400, "Amount exceeds group credit pool");
    }

    const initialStatus = isInstitutional
      ? LoanStatus.INSTITUTIONAL_PENDING
      : LoanStatus.PENDING_APPROVAL;

    return this.dbDao.withTransaction(async (transaction) => {
      const totalPayable = this.computeTotalPayable(input.amount, input.interestRate, input.tenorMonths);
      const loan = await this.loanDao.createLoan(
        {
          borrowerId: input.borrowerId,
          groupId: input.groupId,
          amount: input.amount,
          interestRate: input.interestRate,
          tenorMonths: input.tenorMonths,
          loanPurpose: input.loanPurpose ?? null,
          status: initialStatus,
          outstandingBalance: totalPayable
        },
        transaction
      );

      if (initialStatus === LoanStatus.PENDING_APPROVAL) {
        await this.loanApprovalDao.createPendingApprovals(
          activeMembers.map((member) => ({
            loanId: loan.id,
            approverId: member.userId,
            decision: ApprovalDecision.PENDING
          })),
          transaction
        );
        const borrower = await this.userDao.findById(input.borrowerId, transaction);
        const borrowerName = borrower?.fullName ?? "A member";
        for (const member of activeMembers) {
          if (member.userId !== input.borrowerId) {
            this.notificationService
              .notifyLoanRequest(member.userId, input.amount, borrowerName)
              .catch(() => {});
            const approver = await this.userDao.findById(member.userId, transaction);
            if (approver?.email) {
              this.emailService
                .sendLoanRequest(approver.email, {
                  approverName: approver.fullName,
                  borrowerName,
                  amount: input.amount,
                  currency: "NGN"
                })
                .catch(() => {});
            }
          }
        }
      }
      if (isInstitutional) {
        await this.partnerLenderQueuePush(loan.id, input.amount, input.groupId);
      }

      return loan;
    });
  }

  /** Mock: push to partner lender queue. In production would call external service. */
  private async partnerLenderQueuePush(
    _loanId: string,
    _amount: number,
    _groupId: string
  ): Promise<void> {
    // TODO: integrate with real partner lender queue; await external approval callback
  }

  /**
   * After external partner approval: move loan from INSTITUTIONAL_PENDING to PENDING_APPROVAL
   * and create pending approval records for group members.
   */
  async continueInstitutionalLoan(loanId: string): Promise<Loan> {
    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(loanId, transaction);
      if (!loan) throw new HttpError(404, "Loan not found");
      if (loan.status !== LoanStatus.INSTITUTIONAL_PENDING) {
        throw new HttpError(400, "Loan is not awaiting institutional approval");
      }
      if (!loan.groupId) throw new HttpError(400, "Not a group loan");

      const activeMembers = await this.groupMemberDao.findActiveMembersByGroupId(
        loan.groupId,
        transaction
      );
      await loan.update({ status: LoanStatus.PENDING_APPROVAL }, { transaction });
      await this.loanApprovalDao.createPendingApprovals(
        activeMembers.map((member) => ({
          loanId: loan.id,
          approverId: member.userId,
          decision: ApprovalDecision.PENDING
        })),
        transaction
      );
      return loan;
    });
  }

  async disburseLoan(loanId: string, transaction: Transaction): Promise<Loan> {
    const loan = await this.loanDao.findById(loanId, transaction);
    if (!loan) throw new HttpError(404, "Loan not found");

    if ([LoanStatus.DISBURSED, LoanStatus.ACTIVE, LoanStatus.REPAID].includes(loan.status)) {
      return loan;
    }

    if (loan.groupId) {
      const members = await this.groupMemberDao.findActiveMemberUserIds(loan.groupId);
      const userIds = members.map((m) => m.userId);
      const mandateStatusByUser = await this.directDebitMandateDao.findAllActiveByGroupUserIds(
        loan.groupId,
        userIds,
        transaction
      );
      const nonCompliant: string[] = [];
      for (const uid of userIds) {
        const status = mandateStatusByUser.get(uid);
        if (status !== MandateStatus.ACTIVE) nonCompliant.push(uid);
      }
      if (nonCompliant.length > 0) {
        throw new HttpError(400, "All members must have an ACTIVE direct debit mandate before disbursement", {
          nonCompliantMemberIds: nonCompliant
        });
      }
    }

    await loan.update({ status: LoanStatus.DISBURSED }, { transaction });

    if (loan.groupId) {
      const group = await this.groupDao.findById(loan.groupId, transaction);
      if (!group) throw new HttpError(404, "Group not found");

      const newPool = toNumber(group.currentCreditPool) - toNumber(loan.amount);
      await group.update({ currentCreditPool: Math.max(0, newPool) }, { transaction });
    }

    await this.generateRepaymentSchedule(loan, transaction);
    await loan.update({ status: LoanStatus.ACTIVE }, { transaction });

    return loan;
  }

  async getLoanById(id: string, userId: string): Promise<Loan> {
    const loan = await this.loanDao.getLoanWithRelations(id);
    if (!loan) throw new HttpError(404, "Loan not found");

    const isBorrower = loan.borrowerId === userId;
    if (isBorrower) return loan;

    const approval = await this.loanApprovalDao.findByLoanAndApprover(id, userId);
    if (!approval) throw new HttpError(403, "You do not have access to this loan");

    return loan;
  }

  private computeTotalPayable(amount: number, interestRate: number, tenorMonths: number): number {
    const interest = amount * interestRate * (tenorMonths / 12);
    return amount + interest;
  }

  private async generateRepaymentSchedule(loan: Loan, transaction: Transaction): Promise<void> {
    const existingSchedule = await this.repaymentDao.countByLoanId(loan.id, transaction);
    if (existingSchedule > 0) return;

    const monthlyAmount = toNumber(loan.outstandingBalance) / loan.tenorMonths;
    const schedule = Array.from({ length: loan.tenorMonths }, (_, i) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);

      return {
        loanId: loan.id,
        amount: Number(monthlyAmount.toFixed(2)),
        dueDate,
        status: RepaymentStatus.DUE as RepaymentStatus
      };
    });

    await this.repaymentDao.createSchedule(schedule, transaction);
  }
}
