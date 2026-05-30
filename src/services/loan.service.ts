import { Transaction } from "sequelize";
import { DbDao } from "../dao/db.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanApprovalDao } from "../dao/loan-approval.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { MandateDao } from "../dao/mandate.dao.js";
import { MemberMandateDao } from "../dao/member-mandate.dao.js";
import { UserMandateDao } from "../dao/user-mandate.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { Loan, LoanApproval, Mandate, UserMandate } from "../models/index.js";
import {
  ApprovalDecision,
  CredibilityLevel,
  GroupMemberStatus,
  GroupMandateStatus,
  KycStatus,
  LoanPurpose,
  LoanStatus,
  MandateStatus,
  RepaymentStatus
} from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { addLocalDays, addLocalMonths, toLocalDateYmd } from "../utils/mandate-period.js";
import { toNumber } from "../utils/number.js";
import { EmailService } from "../email/email.service.js";
import { NotificationService } from "./notification.service.js";
import { CreditService } from "./credit.service.js";

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

/** 40% of annual income for individual mandate totals only. */
const ACCESS_INCOME_RATIO = 0.4;
const MONTHS_PER_YEAR = 12;
/** Group mandate spans 12 months; `maximumAmount` is the six-month access cap. */
const SEMESTERS_PER_MANDATE_YEAR = 2;
const OUTSTANDING_BALANCE_VISIBLE_STATUSES = new Set<LoanStatus>([
  LoanStatus.DISBURSED,
  LoanStatus.ACTIVE,
  LoanStatus.REPAID,
  LoanStatus.DEFAULTED
]);

export class LoanService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly userDao: UserDao,
    private readonly groupDao: GroupDao,
    private readonly creditService: CreditService,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly loanDao: LoanDao,
    private readonly loanApprovalDao: LoanApprovalDao,
    private readonly mandateDao: MandateDao,
    private readonly memberMandateDao: MemberMandateDao,
    private readonly userMandateDao: UserMandateDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly userKycDataDao: UserKycDataDao,
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
      await this.userMandateDao.expireForUser(input.borrowerId, transaction);
      let userMandate = await this.userMandateDao.findCurrentForUser(input.borrowerId, transaction);
      if (!userMandate) {
        userMandate = await this.ensureMandateForUser(input.borrowerId, transaction);
      }

      const totalAccessAmount = toNumber(userMandate.totalAccessAmount);
      const usedAmount = await this.loanDao.sumDisbursedAmountByUserMandateId(
        userMandate.id,
        transaction
      );
      const maxAmount = totalAccessAmount - usedAmount;
      if (input.amount > maxAmount) {
        throw new HttpError(400, "Amount exceeds your individual access amount for this mandate period", {
          maxAmount: Number(maxAmount.toFixed(2)),
          mandateEndDate:
            typeof userMandate.endDate === "string"
              ? (userMandate.endDate as string).slice(0, 10)
              : toLocalDateYmd(userMandate.endDate instanceof Date ? userMandate.endDate : new Date(userMandate.endDate))
        });
      }

      const totalPayable = this.computeTotalPayable(input.amount, input.interestRate, input.tenorMonths);
      const loan = await this.loanDao.createLoan(
        {
          borrowerId: input.borrowerId,
          groupId: null,
          userMandateId: userMandate.id,
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
    if (group.creditFrozen) {
      throw new HttpError(403, "This group's credit is frozen by an administrator");
    }

    // Admin-approved access cap: prefer maximumAmount, fall back to targetCredit, then live pool.
    const groupApprovedCap = this.resolveGroupAccessCap(group);
    if (groupApprovedCap > 0 && input.amount > groupApprovedCap) {
      throw new HttpError(
        400,
        "Amount exceeds the group's approved maximum (availableCreditPool). Reduce the amount or ask an admin to increase the maximumAmount.",
        { availableCreditPool: Number(groupApprovedCap.toFixed(2)) }
      );
    }

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

    const memberUserIds = activeMembers.map((m) => m.userId);
    const membersWithKyc = await this.userDao.findByIdsWithKyc(memberUserIds);
    const notApproved = membersWithKyc.filter((u) => u.kycStatus !== KycStatus.APPROVED);
    if (notApproved.length > 0) {
      const names = notApproved.map((u) => u.fullName).join(", ");
      throw new HttpError(
        400,
        `All group members must complete KYC before any loan can be requested. Pending: ${names}`
      );
    }

    const currentPool = toNumber(group.currentCreditPool);
    // Institutional escalation: VERIFIED_TRUST_GROUP can request above the live pool
    // (but never above the admin-approved cap, which is enforced earlier).
    const isInstitutional =
      group.credibilityLevel === CredibilityLevel.VERIFIED_TRUST_GROUP && input.amount > currentPool;


    return this.dbDao.withTransaction(async (transaction) => {
      await this.mandateDao.expireMandatesPastEndDate(input.groupId, transaction);
      let mandate = await this.mandateDao.findCurrentGroupMandate(input.groupId, transaction);
      if (!mandate) {
        mandate = await this.ensureMandateForGroup(input.groupId, transaction);
      }

      const totalAccessAmount = toNumber(mandate.totalAccessAmount);
      const usedAmount = await this.loanDao.sumDisbursedAmountByMandateId(mandate.id, transaction);
      const maxAmount = totalAccessAmount - usedAmount;
      if (input.amount > maxAmount) {
        throw new HttpError(400, "Amount exceeds group access amount for this year", {
          maxAmount: Number(maxAmount.toFixed(2))
        });
      }

      if (!isInstitutional && input.amount > currentPool) {
        throw new HttpError(400, "Amount exceeds the group's available credit pool", {
          availableCreditPool: Number(currentPool.toFixed(2))
        });
      }

      const mandateEndYmd =
        typeof mandate.endDate === "string"
          ? (mandate.endDate as string).slice(0, 10)
          : toLocalDateYmd(mandate.endDate instanceof Date ? mandate.endDate : new Date(mandate.endDate));
      const loanLastRepaymentYmd = toLocalDateYmd(addLocalMonths(new Date(), input.tenorMonths));
      if (loanLastRepaymentYmd > mandateEndYmd) {
        throw new HttpError(
          400,
          "Loan tenor extends beyond the current group mandate end date. Renew the group mandate or reduce the loan tenor so the last repayment falls on or before the mandate expires.",
          {
            mandateEndDate: mandateEndYmd,
            lastRepaymentDateIfStartingNow: loanLastRepaymentYmd,
            tenorMonths: input.tenorMonths
          }
        );
      }

      const initialStatus = isInstitutional
        ? LoanStatus.INSTITUTIONAL_PENDING
        : LoanStatus.PENDING_APPROVAL;

      const totalPayable = this.computeTotalPayable(input.amount, input.interestRate, input.tenorMonths);
      const loan = await this.loanDao.createLoan(
        {
          borrowerId: input.borrowerId,
          groupId: input.groupId,
          mandateId: mandate.id,
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
        const approverMembers = activeMembers.filter((member) => member.userId !== input.borrowerId);
        await this.loanApprovalDao.createPendingApprovals(
          approverMembers.map((member) => ({
            loanId: loan.id,
            approverId: member.userId,
            decision: ApprovalDecision.PENDING
          })),
          transaction
        );
        const borrower = await this.userDao.findById(input.borrowerId, transaction);
        const borrowerName = borrower?.fullName ?? "A member";
        for (const member of approverMembers) {
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
      if (isInstitutional) {
        await this.partnerLenderQueuePush(loan.id, input.amount, input.groupId);
      }

      return loan;
    });
  }

  /**
   * Create a new group mandate period: starts local today + 25 days, ends 12 calendar months after start.
   * `year` column encodes period start as YYYYMMDD (UNIQUE with groupId).
   * `totalAccessAmount`: if the group has `maximumAmount`, use two × that (two six-month windows in the year);
   * otherwise use computed `targetCredit` (member income formula).
   */
  private async ensureMandateForGroup(groupId: string, transaction: Transaction): Promise<Mandate> {
    const groupRow = await this.groupDao.findById(groupId, transaction);
    if (!groupRow) throw new HttpError(404, "Group not found");

    const maxHalfYear = groupRow.maximumAmount != null ? toNumber(groupRow.maximumAmount) : 0;
    const totalAccessAmount =
      maxHalfYear > 0
        ? Number((maxHalfYear * SEMESTERS_PER_MANDATE_YEAR).toFixed(2))
        : await this.creditService.calculateGroupTargetCredit(groupId, transaction);

    const activeMembers = await this.groupMemberDao.findActiveMembersByGroupId(groupId, transaction);

    const startDate = addLocalDays(new Date(), 25);
    const endDate = addLocalMonths(startDate, 12);
    const ymd = toLocalDateYmd(startDate).replace(/-/g, "");
    const yearSlot = Number.parseInt(ymd, 10);

    const mandate = await this.mandateDao.create(
      {
        groupId,
        year: yearSlot,
        totalAccessAmount,
        startDate,
        endDate,
        status: GroupMandateStatus.ACTIVE
      },
      transaction
    );
    for (const member of activeMembers) {
      await this.memberMandateDao.create(
        { mandateId: mandate.id, userId: member.userId },
        transaction
      );
    }
    return mandate;
  }

  /**
   * Create a new individual mandate period: starts local today + 25 days, ends 12 calendar months after start.
   * totalAccessAmount = 40% of user's annual income.
   */
  async ensureMandateForUser(userId: string, transaction: Transaction): Promise<UserMandate> {
    const user = await this.userDao.findById(userId, transaction);
    if (!user) throw new HttpError(404, "User not found");

    const kycIncomes = await this.userKycDataDao.findEffectiveEmploymentIncomeByUserIds(
      [userId],
      transaction
    );
    const fromUser = toNumber(user.monthlyIncome ?? 0);
    const fromKyc = kycIncomes.get(userId) ?? 0;
    const monthlyIncome = fromUser > 0 ? fromUser : fromKyc;
    const totalAccessAmount = Number(
      (ACCESS_INCOME_RATIO * MONTHS_PER_YEAR * monthlyIncome).toFixed(2)
    );

    const startDate = addLocalDays(new Date(), 25);
    const endDate = addLocalMonths(startDate, 12);
    const ymd = toLocalDateYmd(startDate).replace(/-/g, "");
    const yearSlot = Number.parseInt(ymd, 10);

    return this.userMandateDao.create(
      {
        userId,
        year: yearSlot,
        totalAccessAmount,
        startDate,
        endDate,
        status: GroupMandateStatus.ACTIVE
      },
      transaction
    );
  }

  /** Individual activity feed: the authenticated user's own loan requests + repayments, newest first. */
  async getMyActivity(
    userId: string,
    limit: number
  ): Promise<
    Array<{
      type: "loan_requested" | "repayment";
      at: string;
      summary: string;
      amount: number | null;
      loanId: string | null;
    }>
  > {
    const loans = await this.loanDao.findIndividualByBorrowerId(userId);
    const recentLoans = loans.slice(0, limit).map((l) => ({
      type: "loan_requested" as const,
      at: l.createdAt.toISOString(),
      summary: `Loan request — ${l.status}`,
      amount: toNumber(l.amount),
      loanId: l.id
    }));

    const repayments = await this.repaymentDao.findPaidByLoanIds(
      loans.map((l) => l.id),
      limit
    );
    const fromRepayments = repayments.map((r) => ({
      type: "repayment" as const,
      at: r.paidAt!.toISOString(),
      summary: "Repayment",
      amount: toNumber(r.amount),
      loanId: r.loanId
    }));

    const merged = [...recentLoans, ...fromRepayments].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    return merged.slice(0, limit);
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
      const approverMembers = activeMembers.filter((member) => member.userId !== loan.borrowerId);
      await loan.update({ status: LoanStatus.PENDING_APPROVAL }, { transaction });
      await this.loanApprovalDao.createPendingApprovals(
        approverMembers.map((member) => ({
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

    const mayDisburseFrom = [
      LoanStatus.APPROVED,
      LoanStatus.REVIEWING,
      LoanStatus.PROCESSING
    ];
    if (!mayDisburseFrom.includes(loan.status)) {
      throw new HttpError(400, "Loan cannot be disbursed in its current status", {
        status: loan.status
      });
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
      const debitOk = (s: MandateStatus | undefined) =>
        s === MandateStatus.ACTIVE || s === MandateStatus.APPROVED;
      for (const uid of userIds) {
        const status = mandateStatusByUser.get(uid);
        if (!debitOk(status)) nonCompliant.push(uid);
      }
      if (nonCompliant.length > 0) {
        throw new HttpError(400, "All members must have an active or admin-approved direct debit mandate before disbursement", {
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

    if (!OUTSTANDING_BALANCE_VISIBLE_STATUSES.has(loan.status)) {
      loan.setDataValue("outstandingBalance", 0);
    }

    const isBorrower = loan.borrowerId === userId;
    if (isBorrower) return loan;

    const approval = await this.loanApprovalDao.findByLoanAndApprover(id, userId);
    if (!approval) throw new HttpError(403, "You do not have access to this loan");

    return loan;
  }

  /** Loans where the authenticated user is the borrower and `groupId` is null. */
  async listMyIndividualLoans(borrowerId: string): Promise<Loan[]> {
    return this.loanDao.findIndividualByBorrowerId(borrowerId);
  }

  /** Group loans for groups the user belongs to, with optional status/date/myLoan filters. */
  async listMyGroupLoans(
    userId: string,
    filters?: {
      statuses?: LoanStatus[];
      startDate?: Date;
      endDate?: Date;
      myLoan?: boolean;
    }
  ): Promise<Loan[]> {
    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    if (groupIds.length === 0) return [];
    const [loans, activeMemberCountByGroupId] = await Promise.all([
      this.loanDao.findByGroupIds(
        groupIds,
        {
          statuses: filters?.statuses,
          dateFrom: filters?.startDate,
          dateTo: filters?.endDate,
          borrowerId: filters?.myLoan ? userId : undefined
        }
      ),
      this.groupMemberDao.countActiveMembersByGroupIds(groupIds)
    ]);

    for (const loan of loans) {
      const groupId = loan.groupId;
      const memberCount = groupId ? activeMemberCountByGroupId.get(groupId) ?? 0 : 0;
      const approvals = (loan as Loan & { approvals?: LoanApproval[] }).approvals ?? [];
      const approvedMemberCount = approvals.filter(
        (approval) => approval.decision === ApprovalDecision.APPROVED
      ).length;
      const isApprove = approvals.some(
        (approval) =>
          approval.approverId === userId && approval.decision === ApprovalDecision.APPROVED
      );
      (loan as unknown as { setDataValue: (k: string, v: number) => void }).setDataValue(
        "memberCount",
        memberCount
      );
      (loan as unknown as { setDataValue: (k: string, v: number) => void }).setDataValue(
        "approvedMemberCount",
        approvedMemberCount
      );
      (loan as unknown as { setDataValue: (k: string, v: boolean) => void }).setDataValue(
        "isApprove",
        isApprove
      );
    }

    return loans;
  }

  private computeTotalPayable(amount: number, interestRate: number, tenorMonths: number): number {
    const interest = amount * interestRate * (tenorMonths / 12);
    return amount + interest;
  }

  /**
   * The admin-approved per-loan access cap for a group. Mirrors the dashboard
   * `availableCreditPool` so the user is always shown a number they can actually
   * borrow against. Falls back to `targetCredit` then `currentCreditPool` when
   * `maximumAmount` is not set.
   */
  private resolveGroupAccessCap(group: {
    maximumAmount: number | null;
    targetCredit: number;
    currentCreditPool: number;
  }): number {
    const max = group.maximumAmount != null ? toNumber(group.maximumAmount) : 0;
    if (max > 0) return max;
    const target = toNumber(group.targetCredit);
    if (target > 0) return target;
    return toNumber(group.currentCreditPool);
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
