import { LoanApprovalDao } from "../dao/loan-approval.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { NotificationDao } from "../dao/notification.dao.js";
import { UserMandateDao } from "../dao/user-mandate.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { ApprovalDecision, KycStatus, LoanStatus, MandateStatus } from "../models/enums.js";
import { toNumber } from "../utils/number.js";
import { HttpError } from "../utils/http-error.js";
import type { User } from "../models/index.js";
import type { Statement } from "../models/index.js";

/** Individual (non-group) user onboarding checklist. */
export type IndividualOnboarding = {
  revenueEntered: RevenueStatus;
  kycComplete: KycCompleteStatus;
  bankStatement: BankStatementStatus;
  directDebitSetup: boolean;
  /** Individual access amount = 40% of annual income. */
  accessAmount: number;
};

/** Current individual mandate period info shown on the dashboard. */
export type IndividualMandateInfo = {
  id: string;
  status: "ACTIVE" | "EXPIRED";
  totalAccessAmount: number;
  usedAmount: number;
  remainingAccess: number;
  startDate: string;
  endDate: string;
};

// --- Onboarding view (some or all have not completed KYC) ---
export type RevenueStatus = "verified" | "pending";
export type KycCompleteStatus = "done" | "processing" | "pending";
export type BankStatementStatus = "uploaded" | "awaiting";
export type MemberActionType = "edit_details" | "poke_member" | "trophy";

export type GroupOnboardingMember = {
  userId: string;
  fullName: string;
  role: "CREATOR" | "MEMBER";
  isYou: boolean;
  revenueEntered: RevenueStatus;
  kycComplete: KycCompleteStatus;
  bankStatement: BankStatementStatus;
  contribution: number;
  action: MemberActionType;
};

export type GroupOnboarding = {
  groupId: string;
  groupName: string;
  onboardingPercent: number;
  groupGoal: number;
  unlockedSoFar: number;
  membersReady: number;
  membersTotal: number;
  creditStatus: "locked" | "unlocked";
  lockReason?: string;
  members: GroupOnboardingMember[];
};

// --- Full view (everybody has completed KYC) ---
export type PendingPeerApproval = {
  loanId: string;
  borrowerId: string;
  borrowerName: string;
  successfulRepayments: number;
  amount: number;
  purpose: string | null;
  currency?: string;
};

export type RecentActivityItem = {
  type: string;
  message: string;
  timestamp: string;
  category?: "system" | "financial" | "member";
};

export type NonAcceptedMembership = {
  userId: string;
  fullName: string;
  email: string;
  status: "INVITED";
  invitedAt: string | null;
};

export type BadgeProgress = {
  current: number;
  target: number;
  nextMilestone?: string;
};

// --- Unified dashboard response ---
export type DashboardData = {
  view: "onboarding" | "full";
  /**
   * Whether this is a group member ("group") or standalone individual ("individual").
   * Clients use this to choose between group-pool widgets and individual-mandate widgets.
   */
  userType: "group" | "individual";
  user: {
    fullName: string;
    memberIdDisplay: string;
    trustLevel: string;
    currentBalance: number;
  };
  groupHealthPercent: number;
  allKycComplete: boolean;
  groupOnboarding: GroupOnboarding | null;
  /** Onboarding checklist for individual (non-group) users. Null for group members. */
  individualOnboarding: IndividualOnboarding | null;
  availableCreditPool: number;
  creditPoolUtilizationPercent: number;
  personalLimit: number;
  projectedGroupLimit: number;
  trustBadge: string;
  badgeProgress: BadgeProgress | null;
  activeLoans: number;
  pendingApprovalsCount: number;
  pendingPeerApprovals: PendingPeerApproval[];
  recentActivity: RecentActivityItem[];
  earnBonusPoints: { description: string; invitePoints: number };
  groupPoolStatus: Array<{ groupId: string; groupName: string; currentPool: number }>;
  credibilityScore: number | null;
  creditEligibility: number;
  /** Deadline (e.g. group quarterly end); null if not set or not a group member. */
  deadline: string | null;
  /** Projected amount (group target credit / goal). */
  projectedAmount: number;
  /** Members who have not yet accepted the group invite. Empty for individual users. */
  nonAcceptedMemberships: NonAcceptedMembership[];
  /** Current individual mandate period. Null for group members. */
  individualMandate: IndividualMandateInfo | null;
};

function memberIdDisplay(userId: string): string {
  const hash = userId.replace(/-/g, "").slice(-8);
  return `#${hash.slice(0, 4)}-${hash.slice(4)}`;
}

function getRevenueStatus(user: User): RevenueStatus {
  return user.monthlyIncome != null && Number(user.monthlyIncome) > 0 ? "verified" : "pending";
}

function getKycCompleteStatus(user: User): KycCompleteStatus {
  if (user.kycStatus === KycStatus.APPROVED) return "done";
  if (
    [KycStatus.PENDING, KycStatus.SUBMITTED, KycStatus.RESUBMITTED, KycStatus.FLAGGED].includes(user.kycStatus) &&
    user.kycStep > 0
  )
    return "processing";
  return "pending";
}

function getBankStatementStatus(statement: Statement | null): BankStatementStatus {
  if (!statement) return "awaiting";
  const hasData = statement.statement && typeof statement.statement === "object" && Object.keys(statement.statement as object).length > 0;
  return statement.status || hasData ? "uploaded" : "awaiting";
}

function getMemberAction(
  isYou: boolean,
  revenue: RevenueStatus,
  kyc: KycCompleteStatus,
  bank: BankStatementStatus
): MemberActionType {
  if (isYou) return "edit_details";
  const allDone = revenue === "verified" && kyc === "done" && bank === "uploaded";
  if (allDone) return "trophy";
  return "poke_member";
}

export class DashboardService {
  constructor(
    private readonly userDao: UserDao,
    private readonly loanDao: LoanDao,
    private readonly loanApprovalDao: LoanApprovalDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly groupDao: GroupDao,
    private readonly statementDao: StatementDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly notificationDao: NotificationDao,
    private readonly userMandateDao: UserMandateDao,
    private readonly directDebitMandateDao: DirectDebitMandateDao
  ) {}

  async getDashboard(userId: string): Promise<DashboardData> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(404, "User not found");

    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    const isGroupMember = groupIds.length > 0;
    const userType: "group" | "individual" = isGroupMember ? "group" : "individual";

    const [groupPoolStatus, groupOnboarding, activeLoans, pendingApprovalsCount, pendingPeerApprovals, recentActivity, nonAcceptedMemberships] =
      await Promise.all([
        this.getGroupPoolStatus(userId),
        isGroupMember ? this.getGroupOnboarding(groupIds[0], userId) : Promise.resolve(null),
        this.getActiveLoansCount(userId),
        this.getPendingApprovalsCount(userId),
        this.getPendingPeerApprovals(userId),
        this.getRecentActivity(userId),
        isGroupMember ? this.getNonAcceptedMemberships(groupIds) : Promise.resolve([])
      ]);

    // For group members: KYC completeness is driven by whether all members are onboarded.
    // For individuals: it is simply whether their own KYC is approved.
    const allKycComplete = isGroupMember
      ? (groupOnboarding ? groupOnboarding.creditStatus === "unlocked" : false)
      : user.kycStatus === KycStatus.APPROVED;

    const view = allKycComplete ? "full" : "onboarding";

    const firstGroup = isGroupMember ? await this.groupDao.findById(groupIds[0]) : null;
    const availableCreditPool = firstGroup ? toNumber(firstGroup.currentCreditPool) : 0;
    const projectedGroupLimit = firstGroup ? toNumber(firstGroup.targetCredit) : 0;
    const deadline = firstGroup?.quarterlyEndDate
      ? new Date(firstGroup.quarterlyEndDate).toISOString()
      : null;
    const projectedAmount = firstGroup ? toNumber(firstGroup.targetCredit) : 0;
    const creditPoolUtilizationPercent =
      projectedGroupLimit > 0 ? Math.round((availableCreditPool / projectedGroupLimit) * 100) : 0;
    const credibilityScore = isGroupMember ? await this.getMaxGroupCredibility(userId) : null;
    const creditEligibility = toNumber(user.creditLimit);
    const trustBadge = this.trustLevelToBadge(user.trustLevel);
    const badgeProgress = this.getBadgeProgress(user.trustScore, user.trustLevel);

    // Individual-specific sections
    const individualOnboarding = !isGroupMember
      ? await this.getIndividualOnboarding(userId, user)
      : null;
    const individualMandate = !isGroupMember
      ? await this.getIndividualMandateInfo(userId)
      : null;

    // Group health: % of members ready; for individuals: 100 if KYC done, else based on their own steps.
    const groupHealthPercent = isGroupMember
      ? groupOnboarding
        ? Math.round((groupOnboarding.membersReady / groupOnboarding.membersTotal) * 100)
        : 0
      : user.kycStatus === KycStatus.APPROVED
        ? 100
        : Math.round(((user.kycStep ?? 0) / 3) * 100);

    return {
      view,
      userType,
      user: {
        fullName: user.fullName,
        memberIdDisplay: memberIdDisplay(user.id),
        trustLevel: user.trustLevel,
        currentBalance: 0
      },
      groupHealthPercent,
      allKycComplete,
      groupOnboarding,
      individualOnboarding,
      availableCreditPool,
      creditPoolUtilizationPercent,
      personalLimit: creditEligibility,
      projectedGroupLimit,
      trustBadge,
      badgeProgress,
      activeLoans,
      pendingApprovalsCount,
      pendingPeerApprovals,
      recentActivity,
      earnBonusPoints: {
        description: "Invite a trusted peer to join and boost your Badge of Honor score.",
        invitePoints: 50
      },
      groupPoolStatus,
      credibilityScore,
      creditEligibility,
      deadline,
      projectedAmount,
      nonAcceptedMemberships,
      individualMandate
    };
  }

  private async getNonAcceptedMemberships(groupIds: string[]): Promise<NonAcceptedMembership[]> {
    const invitedByGroup = await Promise.all(
      groupIds.map((groupId) => this.groupMemberDao.findPendingInvitedMembersByGroupId(groupId))
    );
    const invited = invitedByGroup.flat();
    if (invited.length === 0) return [];

    // De-dupe by userId because a user might appear in multiple groups; the payload doesn't include groupId.
    const byUserId = new Map<string, (typeof invited)[number]>();
    for (const m of invited) {
      const existing = byUserId.get(m.userId);
      if (!existing) {
        byUserId.set(m.userId, m);
        continue;
      }
      const existingTime = existing.createdAt ? existing.createdAt.getTime() : Number.POSITIVE_INFINITY;
      const mTime = m.createdAt ? m.createdAt.getTime() : Number.POSITIVE_INFINITY;
      if (mTime < existingTime) byUserId.set(m.userId, m);
    }
    const uniqueInvited = Array.from(byUserId.values());

    const userIds = uniqueInvited.map((m) => m.userId);
    const users = await Promise.all(userIds.map((id) => this.userDao.findById(id)));
    const userMap = new Map(userIds.map((id, i) => [id, users[i]]));

    return uniqueInvited.map((m) => {
      const u = userMap.get(m.userId);
      return {
        userId: m.userId,
        fullName: u?.fullName ?? "Unknown",
        email: u?.email ?? "",
        status: "INVITED" as const,
        invitedAt: m.createdAt ? m.createdAt.toISOString() : null
      };
    });
  }

  private trustLevelToBadge(level: string): string {
    const map: Record<string, string> = {
      BRONZE: "Bronze Member",
      SILVER: "Silver Trustee",
      GOLD: "Gold Member",
      ELITE: "Elite Trustee"
    };
    return map[level] ?? level;
  }

  private getBadgeProgress(trustScore: number, trustLevel: string): BadgeProgress {
    const score = toNumber(trustScore);
    const targets: Record<string, number> = { BRONZE: 0, SILVER: 250, GOLD: 500, ELITE: 1000 };
    const levels = ["BRONZE", "SILVER", "GOLD", "ELITE"];
    const idx = levels.indexOf(trustLevel);
    const target = idx < levels.length - 1 ? targets[levels[idx + 1]] ?? 1000 : 1000;
    const nextMilestone = idx < levels.length - 1 ? `Unlock "${this.trustLevelToBadge(levels[idx + 1])}"` : undefined;
    return { current: score, target, nextMilestone };
  }

  private async getGroupOnboarding(groupId: string, currentUserId: string): Promise<GroupOnboarding | null> {
    const group = await this.groupDao.findById(groupId);
    if (!group) return null;
    const allMembers = await this.groupMemberDao.findMembersByGroupId(groupId);
    if (allMembers.length === 0) return null;

    const userIds = allMembers.map((m) => m.userId);
    const [users, statements] = await Promise.all([
      Promise.all(userIds.map((id) => this.userDao.findById(id))),
      this.statementDao.findByUserIds(userIds)
    ]);
    const userMap = new Map<string, User>();
    users.forEach((u) => u && userMap.set(u.id, u));
    const statementByUser = new Map<string, Statement>();
    statements.forEach((s) => statementByUser.set(s.userId, s));

    const CONTRIBUTION_MULTIPLIER = 2;
    const membersList: GroupOnboardingMember[] = allMembers.map((m) => {
      const u = userMap.get(m.userId);
      const revenue = u ? getRevenueStatus(u) : "pending";
      const kyc = u ? getKycCompleteStatus(u) : "pending";
      const bank = getBankStatementStatus(statementByUser.get(m.userId) ?? null);
      const contribution = u && u.monthlyIncome != null ? toNumber(u.monthlyIncome) * CONTRIBUTION_MULTIPLIER : 0;
      const isYou = m.userId === currentUserId;
      const action = getMemberAction(isYou, revenue, kyc, bank);
      return {
        userId: m.userId,
        fullName: u?.fullName ?? "Unknown",
        role: m.role as "CREATOR" | "MEMBER",
        isYou,
        revenueEntered: revenue,
        kycComplete: kyc,
        bankStatement: bank,
        contribution: Math.round(contribution * 100) / 100,
        action
      };
    });

    const membersReady = membersList.filter(
      (m) => m.revenueEntered === "verified" && m.kycComplete === "done" && m.bankStatement === "uploaded"
    ).length;
    const membersTotal = membersList.length;
    const onboardingPercent = membersTotal > 0 ? Math.round((membersReady / membersTotal) * 100) : 0;
    const groupGoal = toNumber(group.targetCredit);
    const unlockedSoFar = toNumber(group.currentCreditPool);
    const creditStatus = membersReady >= membersTotal ? "unlocked" : "locked";
    const lockReason = creditStatus === "locked" ? `${membersTotal - membersReady} member(s) remaining` : undefined;

    return {
      groupId: group.id,
      groupName: group.name,
      onboardingPercent,
      groupGoal,
      unlockedSoFar,
      membersReady,
      membersTotal,
      creditStatus,
      lockReason,
      members: membersList
    };
  }

  private async getPendingPeerApprovals(userId: string): Promise<PendingPeerApproval[]> {
    const { LoanApproval, Loan } = await import("../models/index.js");
    const pending = await LoanApproval.findAll({
      where: { approverId: userId, decision: ApprovalDecision.PENDING },
      attributes: ["loanId"]
    });
    if (pending.length === 0) return [];
    const loanIds = pending.map((a: { loanId: string }) => a.loanId);
    const loans = await Loan.findAll({
      where: { id: loanIds, status: LoanStatus.PENDING_APPROVAL },
      include: [{ association: "borrower" }]
    });
    const result: PendingPeerApproval[] = [];
    for (const loan of loans) {
      const borrower = (loan as unknown as { borrower?: User }).borrower;
      const successfulRepayments = await this.repaymentDao.countPaidByBorrowerId(loan.borrowerId);
      result.push({
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        borrowerName: borrower?.fullName ?? "Member",
        successfulRepayments,
        amount: toNumber(loan.amount),
        purpose: loan.loanPurpose,
        currency: "NGN"
      });
    }
    return result;
  }

  private async getRecentActivity(userId: string, limit = 10): Promise<RecentActivityItem[]> {
    const notifications = await this.notificationDao.findByUserId(userId, limit);
    return notifications.map((n) => ({
      type: n.type,
      message: n.message,
      timestamp: n.createdAt.toISOString(),
      category: n.type.includes("LOAN") ? "financial" : n.type.includes("GROUP") ? "member" : "system"
    }));
  }

  private async getActiveLoansCount(userId: string): Promise<number> {
    const { Loan } = await import("../models/index.js");
    return Loan.count({
      where: {
        borrowerId: userId,
        status: [LoanStatus.ACTIVE, LoanStatus.DISBURSED]
      }
    });
  }

  private async getPendingApprovalsCount(userId: string): Promise<number> {
    const { LoanApproval } = await import("../models/index.js");
    const pending = await LoanApproval.findAll({
      where: { approverId: userId, decision: ApprovalDecision.PENDING },
      attributes: ["loanId"]
    });
    if (pending.length === 0) return 0;
    const loanIds = pending.map((a: { loanId: string }) => a.loanId);
    const { Loan } = await import("../models/index.js");
    return Loan.count({
      where: { id: loanIds, status: LoanStatus.PENDING_APPROVAL }
    });
  }

  /** Onboarding checklist for a standalone (non-group) user. */
  private async getIndividualOnboarding(userId: string, user: User): Promise<IndividualOnboarding> {
    const [statement, ddMandate] = await Promise.all([
      this.statementDao.findByUserId(userId),
      this.directDebitMandateDao.findByUserOnly(userId)
    ]);
    const revenueEntered = getRevenueStatus(user);
    const kycComplete = getKycCompleteStatus(user);
    const bankStatement = getBankStatementStatus(statement);
    const directDebitSetup =
      ddMandate?.status === MandateStatus.ACTIVE ||
      ddMandate?.status === MandateStatus.INPROGRESS;
    const ACCESS_INCOME_RATIO = 0.4;
    const MONTHS_PER_YEAR = 12;
    const monthly = toNumber(user.monthlyIncome ?? 0);
    const accessAmount = Number((ACCESS_INCOME_RATIO * MONTHS_PER_YEAR * monthly).toFixed(2));
    return { revenueEntered, kycComplete, bankStatement, directDebitSetup, accessAmount };
  }

  /** Current individual mandate period summary for dashboard. */
  private async getIndividualMandateInfo(userId: string): Promise<IndividualMandateInfo | null> {
    await this.userMandateDao.expireForUser(userId);
    const mandate = await this.userMandateDao.findCurrentForUser(userId);
    if (!mandate) return null;
    const usedAmount = await this.loanDao.sumDisbursedAmountByUserMandateId(mandate.id);
    const totalAccessAmount = toNumber(mandate.totalAccessAmount);
    const remainingAccess = Math.max(0, totalAccessAmount - usedAmount);
    const startDate =
      typeof mandate.startDate === "string"
        ? (mandate.startDate as string).slice(0, 10)
        : mandate.startDate instanceof Date
          ? mandate.startDate.toISOString().slice(0, 10)
          : String(mandate.startDate);
    const endDate =
      typeof mandate.endDate === "string"
        ? (mandate.endDate as string).slice(0, 10)
        : mandate.endDate instanceof Date
          ? mandate.endDate.toISOString().slice(0, 10)
          : String(mandate.endDate);
    return {
      id: mandate.id,
      status: mandate.status as "ACTIVE" | "EXPIRED",
      totalAccessAmount,
      usedAmount: Number(usedAmount.toFixed(2)),
      remainingAccess: Number(remainingAccess.toFixed(2)),
      startDate,
      endDate
    };
  }

  private async getGroupPoolStatus(
    userId: string
  ): Promise<Array<{ groupId: string; groupName: string; currentPool: number }>> {
    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    const result: Array<{ groupId: string; groupName: string; currentPool: number }> = [];
    for (const groupId of groupIds) {
      const group = await this.groupDao.findById(groupId);
      if (group) {
        result.push({
          groupId: group.id,
          groupName: group.name,
          currentPool: toNumber(group.currentCreditPool)
        });
      }
    }
    return result;
  }

  private async getMaxGroupCredibility(userId: string): Promise<number> {
    const groupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    if (groupIds.length === 0) return 0;
    const groups = await Promise.all(groupIds.map((id) => this.groupDao.findById(id)));
    const scores = groups.filter(Boolean).map((g) => toNumber(g!.credibilityScore));
    return Math.max(0, ...scores);
  }
}
