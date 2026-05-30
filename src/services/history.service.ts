import { Op } from "sequelize";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Group, GroupMember, Loan, Repayment, User } from "../models/index.js";
import {
  CredibilityLevel,
  GroupMemberStatus,
  LoanStatus,
  RepaymentStatus
} from "../models/enums.js";
import { toNumber } from "../utils/number.js";

export type HistoryCategory =
  | "all"
  | "loan_requests"
  | "approved"
  | "repayments"
  | "group"
  | "milestones";

export type HistoryItemType =
  | "loan_requested"
  | "loan_approved"
  | "loan_disbursed"
  | "loan_repaid"
  | "repayment_received"
  | "member_joined"
  | "member_exited"
  | "tier_upgrade";

export type HistoryItem = {
  id: string;
  type: HistoryItemType;
  category: Exclude<HistoryCategory, "all">;
  title: string;
  description: string;
  at: string;
  amount: number | null;
  currency: string | null;
  loanId: string | null;
  groupId: string | null;
  groupName: string | null;
};

export type GetHistoryOpts = {
  category: HistoryCategory;
  limit: number;
  offset: number;
  startDate?: Date;
  endDate?: Date;
};

const CATEGORY_FOR_TYPE: Record<HistoryItemType, Exclude<HistoryCategory, "all">> = {
  loan_requested: "loan_requests",
  loan_approved: "approved",
  loan_disbursed: "approved",
  loan_repaid: "repayments",
  repayment_received: "repayments",
  member_joined: "group",
  member_exited: "group",
  tier_upgrade: "milestones"
};

export class HistoryService {
  constructor(
    private readonly userDao: UserDao,
    private readonly loanDao: LoanDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly groupDao: GroupDao,
    private readonly groupMemberDao: GroupMemberDao
  ) {}

  async getHistory(
    userId: string,
    opts: GetHistoryOpts
  ): Promise<{
    items: HistoryItem[];
    total: number;
    limit: number;
    offset: number;
    category: HistoryCategory;
  }> {
    const limit = Math.min(Math.max(1, opts.limit), 100);
    const offset = Math.max(0, opts.offset);
    const items: HistoryItem[] = [];

    const wantsAll = opts.category === "all";
    const wants = (cat: Exclude<HistoryCategory, "all">) => wantsAll || opts.category === cat;

    if (wants("loan_requests") || wants("approved") || wants("repayments")) {
      const loans = await this.fetchUserLoans(userId);
      const groupNameById = await this.fetchGroupNamesForLoans(loans);

      if (wants("loan_requests")) {
        for (const loan of loans) {
          items.push(this.buildLoanRequested(loan, groupNameById));
        }
      }

      if (wants("approved")) {
        for (const loan of loans) {
          if (this.isApprovedLifecycle(loan.status)) {
            items.push(this.buildLoanApproved(loan, groupNameById));
          }
        }
      }

      if (wants("repayments")) {
        for (const loan of loans) {
          if (loan.status === LoanStatus.REPAID) {
            items.push(this.buildLoanFullyRepaid(loan, groupNameById));
          }
        }

        const loanIds = loans.map((l) => l.id);
        if (loanIds.length > 0) {
          const repayments = await this.repaymentDao.findPaidByLoanIds(loanIds, 200);
          const loanById = new Map(loans.map((l) => [l.id, l]));
          for (const r of repayments) {
            const loan = loanById.get(r.loanId);
            if (!loan) continue;
            items.push(this.buildRepaymentReceived(r, loan, groupNameById));
          }
        }
      }
    }

    if (wants("group")) {
      const groupItems = await this.buildGroupActivity(userId);
      items.push(...groupItems);
    }

    if (wants("milestones")) {
      const milestoneItems = await this.buildMilestones(userId);
      items.push(...milestoneItems);
    }

    const filtered = this.filterByDate(items, opts.startDate, opts.endDate);
    filtered.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    return { items: page, total, limit, offset, category: opts.category };
  }

  private async fetchUserLoans(userId: string): Promise<Loan[]> {
    const [individual, group] = await Promise.all([
      this.loanDao.findIndividualByBorrowerId(userId),
      this.loanDao.findGroupByBorrowerId(userId)
    ]);
    return [...individual, ...group];
  }

  private async fetchGroupNamesForLoans(loans: Loan[]): Promise<Map<string, string>> {
    const groupIds = Array.from(
      new Set(loans.map((l) => l.groupId).filter((id): id is string => !!id))
    );
    const map = new Map<string, string>();
    if (groupIds.length === 0) return map;
    const groups = await Group.findAll({
      where: { id: { [Op.in]: groupIds } },
      attributes: ["id", "name"]
    });
    for (const g of groups) map.set(g.id, g.name);
    return map;
  }

  private isApprovedLifecycle(status: LoanStatus): boolean {
    return [
      LoanStatus.APPROVED,
      LoanStatus.REVIEWING,
      LoanStatus.PROCESSING,
      LoanStatus.DISBURSED,
      LoanStatus.ACTIVE,
      LoanStatus.REPAID
    ].includes(status);
  }

  private buildLoanRequested(loan: Loan, groupNameById: Map<string, string>): HistoryItem {
    const amount = toNumber(loan.amount);
    const groupName = loan.groupId ? groupNameById.get(loan.groupId) ?? null : null;
    const description = loan.groupId
      ? `You requested ${formatNgn(amount)} (${loan.tenorMonths} months). Awaiting group approval.`
      : `You requested ${formatNgn(amount)} (${loan.tenorMonths} months).`;
    return {
      id: `loan_requested:${loan.id}`,
      type: "loan_requested",
      category: "loan_requests",
      title: "Loan requested",
      description,
      at: loan.createdAt.toISOString(),
      amount,
      currency: "NGN",
      loanId: loan.id,
      groupId: loan.groupId,
      groupName
    };
  }

  private buildLoanApproved(loan: Loan, groupNameById: Map<string, string>): HistoryItem {
    const amount = toNumber(loan.amount);
    const groupName = loan.groupId ? groupNameById.get(loan.groupId) ?? null : null;
    const isDisbursed = [
      LoanStatus.DISBURSED,
      LoanStatus.ACTIVE,
      LoanStatus.REPAID
    ].includes(loan.status);
    const description = loan.groupId
      ? `Your request for ${formatNgn(amount)} was approved by the group${isDisbursed ? ". Disbursed." : "."}`
      : `Your request for ${formatNgn(amount)} was approved${isDisbursed ? " and disbursed." : "."}`;
    return {
      id: `loan_approved:${loan.id}`,
      type: "loan_approved",
      category: "approved",
      title: "Loan approved",
      description,
      at: loan.updatedAt.toISOString(),
      amount,
      currency: "NGN",
      loanId: loan.id,
      groupId: loan.groupId,
      groupName
    };
  }

  private buildLoanFullyRepaid(loan: Loan, groupNameById: Map<string, string>): HistoryItem {
    const amount = toNumber(loan.amount);
    const groupName = loan.groupId ? groupNameById.get(loan.groupId) ?? null : null;
    return {
      id: `loan_repaid:${loan.id}`,
      type: "loan_repaid",
      category: "repayments",
      title: "Loan fully repaid",
      description: `You completed repayment of ${formatNgn(amount)} (${loan.tenorMonths} months).`,
      at: loan.updatedAt.toISOString(),
      amount,
      currency: "NGN",
      loanId: loan.id,
      groupId: loan.groupId,
      groupName
    };
  }

  private buildRepaymentReceived(
    r: Repayment,
    loan: Loan,
    groupNameById: Map<string, string>
  ): HistoryItem {
    const amount = toNumber(r.amount);
    const groupName = loan.groupId ? groupNameById.get(loan.groupId) ?? null : null;
    return {
      id: `repayment_received:${r.id}`,
      type: "repayment_received",
      category: "repayments",
      title: "Repayment received",
      description: `You repaid ${formatNgn(amount)} for your active loan.`,
      at: (r.paidAt ?? r.updatedAt).toISOString(),
      amount,
      currency: "NGN",
      loanId: loan.id,
      groupId: loan.groupId,
      groupName
    };
  }

  private async buildGroupActivity(userId: string): Promise<HistoryItem[]> {
    const memberships = await GroupMember.findAll({
      where: { userId, status: GroupMemberStatus.ACTIVE },
      attributes: ["groupId", "createdAt"]
    });
    if (memberships.length === 0) return [];

    const groupIds = memberships.map((m) => m.groupId);
    const myJoinByGroupId = new Map(memberships.map((m) => [m.groupId, m.createdAt]));

    const groups = await Group.findAll({
      where: { id: { [Op.in]: groupIds } },
      attributes: ["id", "name"]
    });
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

    const otherMembers = await GroupMember.findAll({
      where: {
        groupId: { [Op.in]: groupIds },
        userId: { [Op.ne]: userId },
        status: { [Op.in]: [GroupMemberStatus.ACTIVE, GroupMemberStatus.EXITED] }
      },
      include: [{ model: User, as: "user", attributes: ["fullName"] }],
      order: [["createdAt", "DESC"]]
    });

    type GMWithUser = GroupMember & { user?: { fullName: string } };
    const items: HistoryItem[] = [];
    for (const m of otherMembers as GMWithUser[]) {
      const myJoin = myJoinByGroupId.get(m.groupId);
      const groupName = groupNameById.get(m.groupId) ?? "your group";
      const memberName = m.user?.fullName ?? "A member";

      if (m.status === GroupMemberStatus.ACTIVE && myJoin && m.createdAt >= myJoin) {
        items.push({
          id: `member_joined:${m.id}`,
          type: "member_joined",
          category: "group",
          title: "New member",
          description: `${memberName} joined ${groupName}.`,
          at: m.createdAt.toISOString(),
          amount: null,
          currency: null,
          loanId: null,
          groupId: m.groupId,
          groupName
        });
      } else if (m.status === GroupMemberStatus.EXITED) {
        items.push({
          id: `member_exited:${m.id}`,
          type: "member_exited",
          category: "group",
          title: "Member exited",
          description: `${memberName} exited ${groupName}.`,
          at: m.updatedAt.toISOString(),
          amount: null,
          currency: null,
          loanId: null,
          groupId: m.groupId,
          groupName
        });
      }
    }
    return items;
  }

  private async buildMilestones(userId: string): Promise<HistoryItem[]> {
    // No audit table for tier upgrades; surface current credibility level for each
    // active group as a single "Tier upgrade" milestone snapshot. Replace once an
    // audit log exists.
    const activeGroupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId);
    if (activeGroupIds.length === 0) return [];

    const groups = await Group.findAll({
      where: {
        id: { [Op.in]: activeGroupIds },
        credibilityLevel: { [Op.ne]: CredibilityLevel.STANDARD }
      },
      attributes: ["id", "name", "credibilityLevel", "updatedAt"]
    });

    return groups.map((g) => ({
      id: `tier_upgrade:${g.id}`,
      type: "tier_upgrade" as const,
      category: "milestones" as const,
      title: "Tier upgrade",
      description: `Your group ${g.name} achieved ${humanizeCredibility(g.credibilityLevel)} status!`,
      at: g.updatedAt.toISOString(),
      amount: null,
      currency: null,
      loanId: null,
      groupId: g.id,
      groupName: g.name
    }));
  }

  private filterByDate(
    items: HistoryItem[],
    start: Date | undefined,
    end: Date | undefined
  ): HistoryItem[] {
    if (!start && !end) return items;
    return items.filter((it) => {
      const t = new Date(it.at).getTime();
      if (start && t < start.getTime()) return false;
      if (end && t > end.getTime()) return false;
      return true;
    });
  }
}

function formatNgn(amount: number): string {
  return `\u20A6${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function humanizeCredibility(level: CredibilityLevel): string {
  if (level === CredibilityLevel.VERIFIED_TRUST_GROUP) return "Verified Trust";
  return level;
}
