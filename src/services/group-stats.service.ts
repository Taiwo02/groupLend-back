import { Op } from "sequelize";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { RepaymentDao } from "../dao/repayment.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Loan, Repayment } from "../models/index.js";
import { GroupMemberStatus, LoanStatus, RepaymentStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";

const DEFAULT_RANGE_DAYS = 30;

const DISBURSED_LIFECYCLE_STATUSES: LoanStatus[] = [
  LoanStatus.DISBURSED,
  LoanStatus.ACTIVE,
  LoanStatus.REPAID,
  LoanStatus.DEFAULTED
];

export type GroupStatsRange = {
  startDate: string;
  endDate: string;
  days: number;
};

export type GroupStatsSummary = {
  totalDisbursed: number;
  totalSaving: number | null;
  repaymentRatePercent: number;
  defaultRatePercent: number;
  attendancePercent: number | null;
  dueDays: number;
  activeDays: number;
};

export type GroupStatsTimeseriesPoint = {
  date: string;
  disbursed: number;
  repaid: number;
};

export type GroupStatsRepaymentBehaviour = {
  onTime: number;
  late: number;
  total: number;
};

export type GroupStatsLoanCollectionSummary = {
  loansDisbursedInPeriod: number;
  averageLoanSize: number;
  activeLoans: number;
};

export type GroupStatsMemberRow = {
  memberId: string;
  userId: string;
  fullName: string;
  totalCollected: number;
};

export type GroupStatsRepaymentByMember = {
  memberId: string;
  userId: string;
  fullName: string;
  totalSubscribed: number;
  totalRepaid: number;
};

export type GroupStatsResponse = {
  group: { id: string; name: string };
  range: GroupStatsRange;
  summary: GroupStatsSummary;
  disbursementVsRepaymentOverTime: GroupStatsTimeseriesPoint[];
  repaymentBehaviour: GroupStatsRepaymentBehaviour;
  loanCollectionSummary: GroupStatsLoanCollectionSummary;
  loansCollectedByMember: GroupStatsMemberRow[];
  repaymentByMember: GroupStatsRepaymentByMember[];
  memberParticipation: Array<{
    memberId: string;
    userId: string;
    fullName: string;
    participationPercent: number | null;
  }>;
};

export class GroupStatsService {
  constructor(
    private readonly groupDao: GroupDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly loanDao: LoanDao,
    private readonly repaymentDao: RepaymentDao,
    private readonly userDao: UserDao
  ) {}

  async getGroupStats(
    groupId: string,
    userId: string,
    input: { startDate?: string; endDate?: string }
  ): Promise<GroupStatsResponse> {
    const group = await this.groupDao.findById(groupId);
    if (!group) throw new HttpError(404, "Group not found");

    const member = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!member || member.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "You are not an active member of this group");
    }

    const { start, end } = this.resolveRange(input.startDate, input.endDate);

    const [members, allGroupLoans] = await Promise.all([
      this.groupMemberDao.findActiveMembersByGroupId(groupId),
      this.loanDao.findByGroupId(groupId)
    ]);

    const memberUserIds = members.map((m) => m.userId);
    const userById = await this.loadUsers(memberUserIds);

    const lifecycleLoans = allGroupLoans.filter((l) =>
      DISBURSED_LIFECYCLE_STATUSES.includes(l.status)
    );
    const loanIds = allGroupLoans.map((l) => l.id);

    const repaymentsAll =
      loanIds.length > 0
        ? await Repayment.findAll({ where: { loanId: { [Op.in]: loanIds } } })
        : [];

    const loansInPeriod = lifecycleLoans.filter((l) => withinRange(l.createdAt, start, end));
    const repaidInPeriod = repaymentsAll.filter(
      (r) => r.status === RepaymentStatus.PAID && r.paidAt && withinRange(r.paidAt, start, end)
    );
    const repaymentsDueInPeriod = repaymentsAll.filter((r) => withinRange(r.dueDate, start, end));

    const summary = this.buildSummary(lifecycleLoans, repaymentsAll, start, end);
    const timeseries = this.buildTimeseries(lifecycleLoans, repaymentsAll, start, end);
    const repaymentBehaviour = this.buildRepaymentBehaviour(repaidInPeriod);
    const loanCollectionSummary = this.buildLoanCollectionSummary(loansInPeriod, lifecycleLoans);
    const loansCollectedByMember = this.buildLoansCollectedByMember(
      loansInPeriod,
      members,
      userById
    );
    const repaymentByMember = this.buildRepaymentByMember(
      lifecycleLoans,
      repaymentsDueInPeriod,
      members,
      userById
    );

    return {
      group: { id: group.id, name: group.name },
      range: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        days: Math.max(1, Math.round((end.getTime() - start.getTime()) / (86400 * 1000)))
      },
      summary,
      disbursementVsRepaymentOverTime: timeseries,
      repaymentBehaviour,
      loanCollectionSummary,
      loansCollectedByMember,
      repaymentByMember,
      memberParticipation: members.map((m) => ({
        memberId: m.id,
        userId: m.userId,
        fullName: userById.get(m.userId) ?? "Unknown",
        participationPercent: null
      }))
    };
  }

  private async loadUsers(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await this.userDao.findByIds(userIds);
    const map = new Map<string, string>();
    for (const u of users) {
      const fullName = (u as unknown as { fullName?: string }).fullName ?? "Unknown";
      map.set(u.id, fullName);
    }
    // findByIds returns ["id","monthlyIncome"] only; fall back to single fetch if missing
    if (map.size < userIds.length) {
      const missing = userIds.filter((id) => !map.has(id));
      const fetched = await Promise.all(missing.map((id) => this.userDao.findById(id)));
      for (const u of fetched) {
        if (u) map.set(u.id, u.fullName ?? "Unknown");
      }
    }
    return map;
  }

  private resolveRange(
    startDateStr: string | undefined,
    endDateStr: string | undefined
  ): { start: Date; end: Date } {
    const end = endDateStr ? new Date(endDateStr) : endOfDay(new Date());
    const start = startDateStr
      ? new Date(startDateStr)
      : startOfDay(new Date(end.getTime() - DEFAULT_RANGE_DAYS * 86400 * 1000));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new HttpError(400, "Invalid startDate or endDate");
    }
    return { start, end };
  }

  private buildSummary(
    lifecycleLoans: Loan[],
    repayments: Repayment[],
    _start: Date,
    _end: Date
  ): GroupStatsSummary {
    const totalDisbursed = lifecycleLoans.reduce((s, l) => s + toNumber(l.amount), 0);

    const totalRepayments = repayments.length;
    const paidRepayments = repayments.filter((r) => r.status === RepaymentStatus.PAID).length;
    const repaymentRatePercent =
      totalRepayments > 0 ? Math.round((paidRepayments / totalRepayments) * 1000) / 10 : 0;

    const defaulted = lifecycleLoans.filter((l) => l.status === LoanStatus.DEFAULTED).length;
    const defaultRatePercent =
      lifecycleLoans.length > 0
        ? Math.round((defaulted / lifecycleLoans.length) * 10000) / 100
        : 0;

    return {
      totalDisbursed,
      totalSaving: null,
      repaymentRatePercent,
      defaultRatePercent,
      attendancePercent: null,
      dueDays: 0,
      activeDays: 0
    };
  }

  private buildTimeseries(
    lifecycleLoans: Loan[],
    repayments: Repayment[],
    start: Date,
    end: Date
  ): GroupStatsTimeseriesPoint[] {
    const days = Math.max(
      1,
      Math.round((endOfDay(end).getTime() - startOfDay(start).getTime()) / (86400 * 1000)) + 1
    );
    const buckets: GroupStatsTimeseriesPoint[] = [];
    const startDay = startOfDay(start);
    for (let i = 0; i < days; i++) {
      const d = new Date(startDay.getTime() + i * 86400 * 1000);
      buckets.push({ date: ymd(d), disbursed: 0, repaid: 0 });
    }
    const indexFor = (d: Date): number => {
      const day = Math.floor((startOfDay(d).getTime() - startDay.getTime()) / (86400 * 1000));
      return day >= 0 && day < buckets.length ? day : -1;
    };

    for (const loan of lifecycleLoans) {
      const idx = indexFor(loan.createdAt);
      if (idx >= 0) buckets[idx]!.disbursed += toNumber(loan.amount);
    }
    for (const r of repayments) {
      if (r.status !== RepaymentStatus.PAID || !r.paidAt) continue;
      const idx = indexFor(r.paidAt);
      if (idx >= 0) buckets[idx]!.repaid += toNumber(r.amount);
    }
    return buckets;
  }

  private buildRepaymentBehaviour(repaid: Repayment[]): GroupStatsRepaymentBehaviour {
    let onTime = 0;
    let late = 0;
    for (const r of repaid) {
      if (!r.paidAt) continue;
      if (r.paidAt.getTime() <= new Date(r.dueDate).getTime()) onTime++;
      else late++;
    }
    return { onTime, late, total: onTime + late };
  }

  private buildLoanCollectionSummary(
    loansInPeriod: Loan[],
    allLifecycleLoans: Loan[]
  ): GroupStatsLoanCollectionSummary {
    const loansDisbursedInPeriod = loansInPeriod.length;
    const averageLoanSize =
      loansInPeriod.length > 0
        ? Math.round(
            loansInPeriod.reduce((s, l) => s + toNumber(l.amount), 0) / loansInPeriod.length
          )
        : 0;
    const activeLoans = allLifecycleLoans.filter((l) => l.status === LoanStatus.ACTIVE).length;
    return { loansDisbursedInPeriod, averageLoanSize, activeLoans };
  }

  private buildLoansCollectedByMember(
    loansInPeriod: Loan[],
    members: Array<{ id: string; userId: string }>,
    userById: Map<string, string>
  ): GroupStatsMemberRow[] {
    const totals = new Map<string, number>();
    for (const l of loansInPeriod) {
      totals.set(l.borrowerId, (totals.get(l.borrowerId) ?? 0) + toNumber(l.amount));
    }
    return members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      fullName: userById.get(m.userId) ?? "Unknown",
      totalCollected: totals.get(m.userId) ?? 0
    }));
  }

  private buildRepaymentByMember(
    lifecycleLoans: Loan[],
    repaymentsDueInPeriod: Repayment[],
    members: Array<{ id: string; userId: string }>,
    userById: Map<string, string>
  ): GroupStatsRepaymentByMember[] {
    const borrowerByLoanId = new Map<string, string>();
    for (const l of lifecycleLoans) borrowerByLoanId.set(l.id, l.borrowerId);

    const subscribed = new Map<string, number>();
    const repaid = new Map<string, number>();
    for (const r of repaymentsDueInPeriod) {
      const borrowerId = borrowerByLoanId.get(r.loanId);
      if (!borrowerId) continue;
      subscribed.set(borrowerId, (subscribed.get(borrowerId) ?? 0) + toNumber(r.amount));
      if (r.status === RepaymentStatus.PAID) {
        repaid.set(borrowerId, (repaid.get(borrowerId) ?? 0) + toNumber(r.amount));
      }
    }
    return members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      fullName: userById.get(m.userId) ?? "Unknown",
      totalSubscribed: subscribed.get(m.userId) ?? 0,
      totalRepaid: repaid.get(m.userId) ?? 0
    }));
  }
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function endOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(23, 59, 59, 999);
  return c;
}

function withinRange(d: Date, start: Date, end: Date): boolean {
  const t = new Date(d).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
