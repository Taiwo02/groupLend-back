import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { GroupDao } from "../dao/group.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Group, GroupMember, Loan, Repayment, User } from "../models/index.js";
import {
  CredibilityLevel,
  GroupMemberRole,
  GroupMemberStatus,
  GroupStatus,
  KycStatus,
  LoanStatus,
  RepaymentStatus
} from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { effectiveGroupMemberRole } from "../utils/effective-group-member-role.js";
import { toNumber } from "../utils/number.js";
import type { GroupService, CreateGroupInput } from "./group.service.js";

/** Derived UI status for credit groups (admin directory). */
export type AdminGroupOnboardingStatus = "ACTIVE" | "PENDING_KYC" | "ONBOARDING" | "FLAGGED";

function onboardingCaseSql(gAlias: string): string {
  return `CASE
    WHEN ${gAlias}.status = 'INACTIVE' THEN 'FLAGGED'
    WHEN ${gAlias}.status = 'PENDING' THEN 'ONBOARDING'
    WHEN EXISTS (
      SELECT 1 FROM "group_members" gm
      INNER JOIN "users" u ON u.id = gm."userId"
      WHERE gm."groupId" = ${gAlias}.id
        AND gm.status IN ('ACTIVE', 'INVITED')
        AND u."kycStatus" = 'FLAGGED'
    ) THEN 'FLAGGED'
    WHEN EXISTS (
      SELECT 1 FROM "group_members" gm
      INNER JOIN "users" u ON u.id = gm."userId"
      WHERE gm."groupId" = ${gAlias}.id
        AND gm.status IN ('ACTIVE', 'INVITED')
        AND u."kycStatus" <> 'APPROVED'
    ) THEN 'PENDING_KYC'
    ELSE 'ACTIVE'
  END`;
}

export type AdminGroupListRow = {
  id: string;
  name: string;
  groupId: string | null;
  maximumAmount: string | null;
  targetCredit: string;
  groupStatus: string;
  createdAt: Date;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  onboardingStatus: AdminGroupOnboardingStatus;
  memberCount: number;
};

export type AdminGroupsSummary = {
  totalGroups: number;
  activeCreditExposure: number;
  groupsPendingKyc: number;
};

export type AdminGroupFinancialHealth = {
  totalCreditPool: number;
  availablePool: number;
  utilizedAmount: number;
  utilizationPercent: number;
  repaymentRatePercent: number;
  averageRepaymentDelayDays: number | null;
  riskLevel: "VERY_LOW" | "LOW" | "MODERATE" | "ELEVATED";
  defaultRatePercent: number;
  repaymentHistorySixMonths: Array<{ monthLabel: string; year: number; month: number; paidAmount: number }>;
};

export type AdminGroupTier = {
  tierTitle: string;
  credibilityLevel: CredibilityLevel;
  credibilityScore: number;
  institutionalLoanEligible: boolean;
  instantDisbursalEnabled: boolean;
};

export type AdminGroupPageMetadata = {
  establishedAt: string;
  regions: string[];
  industryHint: string | null;
  averageLoanTenorMonths: number | null;
};

export type AdminGroupMemberRow = {
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  role: GroupMemberRole;
  roleLabel: string;
  memberStatus: GroupMemberStatus;
  kycUiStatus: "VERIFIED" | "PENDING_REVIEW" | "MISSING_DOCS";
  bankStatementStatus: "UPLOADED" | "NOT_STARTED";
  creditScore: number | null;
};

export type AdminGroupActivityItem = {
  type: "repayment" | "loan_requested" | "loan_approved" | "loan_disbursed" | "member_joined" | "member_exited";
  at: string;
  summary: string;
  amount: number | null;
  loanId: string | null;
};

function memberKycUi(k: KycStatus): "VERIFIED" | "PENDING_REVIEW" | "MISSING_DOCS" {
  if (k === KycStatus.APPROVED) return "VERIFIED";
  if (k === KycStatus.REJECTED) return "MISSING_DOCS";
  return "PENDING_REVIEW";
}

function roleLabel(role: GroupMemberRole): string {
  if (role === GroupMemberRole.CREATOR) return "Group Lead";
  return "Member";
}

function serializeGroupRecord(g: Group): Record<string, unknown> {
  const plain = g.get({ plain: true }) as Record<string, unknown>;
  delete plain.members;
  for (const key of [
    "targetCredit",
    "currentCreditPool",
    "credibilityScore",
    "minimumAmount",
    "maximumAmount",
    "expectedLoan",
    "interest",
    "penalCharges",
    "overGracePenalCharges"
  ]) {
    const v = plain[key];
    if (v != null && v !== "") plain[key] = toNumber(String(v));
  }
  plain.creditFrozen = Boolean(plain.creditFrozen);
  return plain;
}

export class AdminGroupsService {
  constructor(
    private readonly groupDao: GroupDao,
    private readonly userDao: UserDao,
    private readonly groupService: GroupService,
    private readonly loanDao: LoanDao,
    private readonly statementDao: StatementDao
  ) {}

  async getSummary(): Promise<AdminGroupsSummary> {
    const onboarding = onboardingCaseSql("g");
    const [totals] = await sequelize.query<{
      total_groups: string;
      active_exposure: string;
      pending_kyc_groups: string;
    }>(
      `
      SELECT
        (SELECT COUNT(*)::text FROM "groups") AS total_groups,
        (
          SELECT COALESCE(SUM(COALESCE("maximumAmount", "targetCredit")), 0)::text
          FROM "groups"
          WHERE status = 'ACTIVE'
        ) AS active_exposure,
        (
          SELECT COUNT(*)::text FROM (
            SELECT g.id, (${onboarding}) AS ob
            FROM "groups" g
          ) s
          WHERE s.ob = 'PENDING_KYC'
        ) AS pending_kyc_groups
      `,
      { type: QueryTypes.SELECT }
    );
    return {
      totalGroups: Number(totals.total_groups),
      activeCreditExposure: toNumber(totals.active_exposure),
      groupsPendingKyc: Number(totals.pending_kyc_groups)
    };
  }

  async listGroups(opts: {
    q?: string;
    onboardingStatus?: AdminGroupOnboardingStatus;
    limit: number;
    offset: number;
  }): Promise<{ groups: AdminGroupListRow[]; total: number }> {
    const search = opts.q?.trim() ?? "";
    const like = search ? `%${search}%` : null;
    const onboarding = onboardingCaseSql("g");

    const searchClause = like
      ? `AND (
          g.name ILIKE :like
          OR CAST(g.id AS TEXT) ILIKE :like
          OR COALESCE(g."groupId", '') ILIKE :like
          OR creator."fullName" ILIKE :like
          OR creator.email ILIKE :like
        )`
      : "";

    const filterClause = opts.onboardingStatus
      ? `AND sub."onboardingStatus" = :onboardingStatus`
      : "";

    const countRows = await sequelize.query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total FROM (
        SELECT g.id, (${onboarding}) AS "onboardingStatus"
        FROM "groups" g
        LEFT JOIN "users" creator ON creator.id = g."createdBy"
        WHERE 1 = 1
        ${searchClause}
      ) sub
      WHERE 1 = 1
      ${filterClause}
      `,
      {
        replacements: {
          ...(like ? { like } : {}),
          ...(opts.onboardingStatus ? { onboardingStatus: opts.onboardingStatus } : {})
        },
        type: QueryTypes.SELECT
      }
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await sequelize.query<{
      id: string;
      name: string;
      groupId: string | null;
      maximumAmount: string | null;
      targetCredit: string;
      groupStatus: string;
      createdAt: Date;
      creatorId: string;
      creatorName: string;
      creatorEmail: string;
      onboardingStatus: AdminGroupOnboardingStatus;
      memberCount: string;
    }>(
      `
      SELECT * FROM (
        SELECT
          g.id,
          g.name,
          g."groupId",
          g."maximumAmount"::text AS "maximumAmount",
          g."targetCredit"::text AS "targetCredit",
          g.status AS "groupStatus",
          g."createdAt",
          creator.id AS "creatorId",
          creator."fullName" AS "creatorName",
          creator.email AS "creatorEmail",
          (${onboarding}) AS "onboardingStatus",
          (
            SELECT COUNT(*)::int FROM "group_members" m
            WHERE m."groupId" = g.id AND m.status IN ('ACTIVE', 'INVITED')
          )::text AS "memberCount"
        FROM "groups" g
        LEFT JOIN "users" creator ON creator.id = g."createdBy"
        WHERE 1 = 1
        ${searchClause}
      ) sub
      WHERE 1 = 1
      ${filterClause}
      ORDER BY sub."createdAt" DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements: {
          ...(like ? { like } : {}),
          ...(opts.onboardingStatus ? { onboardingStatus: opts.onboardingStatus } : {}),
          limit: opts.limit,
          offset: opts.offset
        },
        type: QueryTypes.SELECT
      }
    );

    const groups: AdminGroupListRow[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      groupId: r.groupId,
      maximumAmount: r.maximumAmount,
      targetCredit: r.targetCredit,
      groupStatus: r.groupStatus,
      createdAt: r.createdAt,
      creatorId: r.creatorId,
      creatorName: r.creatorName,
      creatorEmail: r.creatorEmail,
      onboardingStatus: r.onboardingStatus,
      memberCount: Number(r.memberCount)
    }));

    return { groups, total };
  }

  async getGroupDetail(groupId: string): Promise<{
    group: Record<string, unknown>;
    onboardingStatus: AdminGroupOnboardingStatus;
    memberCount: number;
    financialHealth: AdminGroupFinancialHealth;
    tier: AdminGroupTier;
    pageMetadata: AdminGroupPageMetadata;
    insightNote: string | null;
  }> {
    const row = await Group.findByPk(groupId, {
      include: [
        { model: User, as: "creator", attributes: ["id", "fullName", "email", "phone"] },
        {
          model: GroupMember,
          as: "members",
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "fullName", "email", "kycStatus", "creditStatus", "creditLimit"]
            }
          ]
        }
      ]
    });
    if (!row) throw new HttpError(404, "Group not found");

    type MemberWithUser = GroupMember & { user?: User | null };
    const group = row as Group & { members?: MemberWithUser[] };
    const members = group.members ?? [];
    const memberRows = members
      .filter((m: MemberWithUser) => m.status === "ACTIVE" || m.status === "INVITED")
      .map((m: MemberWithUser) => ({
        status: m.status,
        kycStatus: m.user?.kycStatus ?? KycStatus.PENDING
      }));
    let onboardingStatus: AdminGroupOnboardingStatus = "ACTIVE";
    if (group.status === GroupStatus.INACTIVE) onboardingStatus = "FLAGGED";
    else if (group.status === GroupStatus.PENDING) onboardingStatus = "ONBOARDING";
    else if (memberRows.some((m) => m.kycStatus === KycStatus.FLAGGED)) onboardingStatus = "FLAGGED";
    else if (memberRows.some((m) => m.kycStatus !== KycStatus.APPROVED)) onboardingStatus = "PENDING_KYC";

    const memberCount = members.filter(
      (m: MemberWithUser) => m.status === GroupMemberStatus.ACTIVE || m.status === GroupMemberStatus.INVITED
    ).length;

    const loans = await this.loanDao.findByGroupId(groupId);
    const loanIds = loans.map((l) => l.id);
    const repayments =
      loanIds.length > 0
        ? await Repayment.findAll({ where: { loanId: { [Op.in]: loanIds } } })
        : [];

    const financialHealth = this.buildFinancialHealth(group, loans, repayments);
    const tier = this.buildTier(group, onboardingStatus, memberCount);
    const pageMetadata = this.buildPageMetadata(group, loans);
    const insightNote = this.buildInsightNote(loans);

    const plain = serializeGroupRecord(group);

    return {
      group: plain,
      onboardingStatus,
      memberCount,
      financialHealth,
      tier,
      pageMetadata,
      insightNote
    };
  }

  private buildFinancialHealth(
    group: Group,
    loans: Loan[],
    repayments: Repayment[]
  ): AdminGroupFinancialHealth {
    const cap =
      toNumber(group.maximumAmount) > 0
        ? toNumber(group.maximumAmount)
        : toNumber(group.targetCredit) > 0
          ? toNumber(group.targetCredit)
          : toNumber(group.currentCreditPool);
    const available = toNumber(group.currentCreditPool);
    const utilizedAmount =
      cap > 0 ? Math.max(0, cap - available) : loans.reduce((s, l) => s + toNumber(l.amount), 0);
    const utilizationPercent = cap > 0 ? Math.round((utilizedAmount / cap) * 1000) / 10 : 0;

    const totalInst = repayments.length;
    const paidInst = repayments.filter((r) => r.status === RepaymentStatus.PAID).length;
    const repaymentRatePercent =
      totalInst > 0 ? Math.round((paidInst / totalInst) * 1000) / 10 : 100;

    const paidWithDates = repayments.filter(
      (r) => r.status === RepaymentStatus.PAID && r.paidAt != null
    );
    let averageRepaymentDelayDays: number | null = null;
    if (paidWithDates.length > 0) {
      const sumDays = paidWithDates.reduce((acc, r) => {
        const due = new Date(r.dueDate).getTime();
        const paid = new Date(r.paidAt!).getTime();
        return acc + Math.max(0, (paid - due) / (86400 * 1000));
      }, 0);
      averageRepaymentDelayDays = Math.round((sumDays / paidWithDates.length) * 10) / 10;
    }

    const lifecycle = loans.filter((l) =>
      [
        LoanStatus.ACTIVE,
        LoanStatus.DISBURSED,
        LoanStatus.REPAID,
        LoanStatus.DEFAULTED
      ].includes(l.status)
    );
    const defaulted = loans.filter((l) => l.status === LoanStatus.DEFAULTED).length;
    const defaultRatePercent =
      lifecycle.length > 0 ? Math.round((defaulted / lifecycle.length) * 10000) / 100 : 0;

    let riskLevel: AdminGroupFinancialHealth["riskLevel"] = "VERY_LOW";
    if (defaultRatePercent > 5) riskLevel = "ELEVATED";
    else if (defaultRatePercent > 1) riskLevel = "MODERATE";
    else if (defaultRatePercent > 0) riskLevel = "LOW";

    const repaymentHistorySixMonths = this.lastSixMonthsRepaidSeries(repayments);

    return {
      totalCreditPool: cap,
      availablePool: available,
      utilizedAmount,
      utilizationPercent,
      repaymentRatePercent,
      averageRepaymentDelayDays,
      riskLevel,
      defaultRatePercent,
      repaymentHistorySixMonths
    };
  }

  private lastSixMonthsRepaidSeries(
    repayments: Repayment[]
  ): Array<{ monthLabel: string; year: number; month: number; paidAmount: number }> {
    const now = new Date();
    const buckets: Array<{ monthLabel: string; year: number; month: number; paidAmount: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthLabel = d.toLocaleString("en-US", { month: "short" });
      buckets.push({ monthLabel, year, month: month + 1, paidAmount: 0 });
    }
    for (const r of repayments) {
      if (r.status !== RepaymentStatus.PAID || !r.paidAt) continue;
      const p = new Date(r.paidAt);
      const b = buckets.find((x) => x.year === p.getFullYear() && x.month === p.getMonth() + 1);
      if (b) b.paidAmount += toNumber(r.amount);
    }
    return buckets;
  }

  private buildTier(
    group: Group,
    onboardingStatus: AdminGroupOnboardingStatus,
    memberCount: number
  ): AdminGroupTier {
    const level = group.credibilityLevel;
    const tierTitle =
      level === CredibilityLevel.VERIFIED_TRUST_GROUP
        ? "Tier 1 — Verified trust group"
        : "Standard";
    const institutionalLoanEligible = level === CredibilityLevel.VERIFIED_TRUST_GROUP;
    const instantDisbursalEnabled =
      onboardingStatus === "ACTIVE" && !group.creditFrozen && memberCount > 0 && group.status === GroupStatus.ACTIVE;

    return {
      tierTitle,
      credibilityLevel: level,
      credibilityScore: toNumber(group.credibilityScore),
      institutionalLoanEligible,
      instantDisbursalEnabled
    };
  }

  private buildPageMetadata(group: Group, loans: Loan[]): AdminGroupPageMetadata {
    const states = Array.isArray(group.states) ? (group.states as string[]) : [];
    const tenorLoans = loans.filter((l) =>
      [LoanStatus.ACTIVE, LoanStatus.REPAID, LoanStatus.DEFAULTED, LoanStatus.DISBURSED].includes(l.status)
    );
    const avgTenor =
      tenorLoans.length > 0
        ? Math.round(
            (tenorLoans.reduce((s, l) => s + l.tenorMonths, 0) / tenorLoans.length) * 10
          ) / 10
        : null;
    const desc = group.description?.trim() ?? null;

    return {
      establishedAt: group.createdAt.toISOString(),
      regions: states.length > 0 ? states : [],
      industryHint: desc && desc.length > 0 ? desc : null,
      averageLoanTenorMonths: avgTenor
    };
  }

  private buildInsightNote(loans: Loan[]): string | null {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 18);
    const recentDefault = loans.some(
      (l) => l.status === LoanStatus.DEFAULTED && new Date(l.createdAt) >= cutoff
    );
    if (!recentDefault) {
      return "No member defaults recorded in this group in the last 18 months.";
    }
    return null;
  }

  async listGroupMembers(
    groupId: string,
    opts: { q?: string; limit: number; offset: number }
  ): Promise<{ members: AdminGroupMemberRow[]; total: number }> {
    const g = await this.groupDao.findById(groupId);
    if (!g) throw new HttpError(404, "Group not found");

    const term = opts.q?.trim();
    const baseWhere: Record<string, unknown> = {
      groupId,
      status: { [Op.in]: [GroupMemberStatus.ACTIVE, GroupMemberStatus.INVITED] }
    };
    const where: Record<string, unknown> = term
      ? {
          [Op.and]: [
            baseWhere,
            {
              [Op.or]: [
                { "$user.fullName$": { [Op.iLike]: `%${term}%` } },
                { "$user.email$": { [Op.iLike]: `%${term}%` } }
              ]
            }
          ]
        }
      : baseWhere;

    const { rows, count } = await GroupMember.findAndCountAll({
      where,
      distinct: true,
      col: "GroupMember.id",
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "kycStatus", "trustScore"]
        }
      ],
      limit: opts.limit,
      offset: opts.offset,
      order: [
        ["role", "ASC"],
        ["createdAt", "ASC"]
      ],
      subQuery: false
    });

    const userIds = rows.map((r) => r.userId);
    const statements = await this.statementDao.findByUserIds(userIds);
    const stmtByUser = new Map(statements.map((s) => [s.userId, s]));

    type GM = GroupMember & { user?: User };
    const members: AdminGroupMemberRow[] = rows.map((row) => {
      const m = row as GM;
      const u = m.user!;
      const kyc = u.kycStatus ?? KycStatus.PENDING;
      const st = stmtByUser.get(u.id);
      const bankOk = st?.status === true;

      const effRole = effectiveGroupMemberRole(g.createdBy, u.id, m.role);
      return {
        memberId: m.id,
        userId: u.id,
        fullName: u.fullName,
        email: u.email,
        role: effRole,
        roleLabel: roleLabel(effRole),
        memberStatus: m.status,
        kycUiStatus: memberKycUi(kyc),
        bankStatementStatus: bankOk ? "UPLOADED" : "NOT_STARTED",
        creditScore: u.trustScore != null ? toNumber(String(u.trustScore)) : null
      };
    });

    return { members, total: count };
  }

  async getGroupActivity(groupId: string, limit: number): Promise<AdminGroupActivityItem[]> {
    const g = await this.groupDao.findById(groupId);
    if (!g) throw new HttpError(404, "Group not found");

    const repayments = await Repayment.findAll({
      where: { status: RepaymentStatus.PAID, paidAt: { [Op.ne]: null } },
      include: [
        {
          model: Loan,
          as: "loan",
          where: { groupId },
          required: true,
          attributes: ["id", "borrowerId", "amount"],
          include: [{ model: User, as: "borrower", attributes: ["fullName"] }]
        }
      ],
      order: [["paidAt", "DESC"]],
      limit
    });

    type RWithLoan = Repayment & {
      loan?: Loan & { borrower?: { fullName: string } };
    };

    const fromRepayments: AdminGroupActivityItem[] = repayments.map((r) => {
      const rw = r as RWithLoan;
      const name = rw.loan?.borrower?.fullName ?? "Member";
      return {
        type: "repayment" as const,
        at: r.paidAt!.toISOString(),
        summary: `${name} repayment`,
        amount: toNumber(r.amount),
        loanId: rw.loan?.id ?? null
      };
    });

    type LWithB = Loan & { borrower?: { fullName: string } };

    const recentLoans = await Loan.findAll({
      where: { groupId },
      order: [["createdAt", "DESC"]],
      limit: Math.min(10, limit),
      include: [{ model: User, as: "borrower", attributes: ["fullName"] }]
    });

    const fromLoans: AdminGroupActivityItem[] = recentLoans.map((l) => {
      const lw = l as LWithB;
      const name = lw.borrower?.fullName ?? "Member";
      return {
        type: "loan_requested" as const,
        at: l.createdAt.toISOString(),
        summary: `${name} loan request (${l.status})`,
        amount: toNumber(l.amount),
        loanId: l.id
      };
    });

    const approvedLoans = await Loan.findAll({
      where: { groupId, status: { [Op.in]: [LoanStatus.APPROVED, LoanStatus.REVIEWING, LoanStatus.PROCESSING] } },
      order: [["updatedAt", "DESC"]],
      limit: Math.min(5, limit),
      include: [{ model: User, as: "borrower", attributes: ["fullName"] }]
    });

    const fromApproved: AdminGroupActivityItem[] = approvedLoans.map((l) => {
      const lw = l as LWithB;
      const name = lw.borrower?.fullName ?? "Member";
      return {
        type: "loan_approved" as const,
        at: l.updatedAt.toISOString(),
        summary: `${name} loan approved`,
        amount: toNumber(l.amount),
        loanId: l.id
      };
    });

    const disbursedLoans = await Loan.findAll({
      where: { groupId, status: { [Op.in]: [LoanStatus.DISBURSED, LoanStatus.ACTIVE] } },
      order: [["updatedAt", "DESC"]],
      limit: Math.min(5, limit),
      include: [{ model: User, as: "borrower", attributes: ["fullName"] }]
    });

    const fromDisbursed: AdminGroupActivityItem[] = disbursedLoans.map((l) => {
      const lw = l as LWithB;
      const name = lw.borrower?.fullName ?? "Member";
      return {
        type: "loan_disbursed" as const,
        at: l.updatedAt.toISOString(),
        summary: `${name} loan disbursed`,
        amount: toNumber(l.amount),
        loanId: l.id
      };
    });

    type GMWithUser = GroupMember & { user?: { fullName: string } };

    const joinedMembers = await GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.ACTIVE },
      order: [["createdAt", "DESC"]],
      limit: Math.min(5, limit),
      include: [{ model: User, as: "user", attributes: ["fullName"] }]
    });

    const fromJoined: AdminGroupActivityItem[] = joinedMembers.map((m) => {
      const mw = m as GMWithUser;
      const name = mw.user?.fullName ?? "Member";
      return {
        type: "member_joined" as const,
        at: m.createdAt.toISOString(),
        summary: `${name} joined the group`,
        amount: null,
        loanId: null
      };
    });

    const exitedMembers = await GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.EXITED },
      order: [["updatedAt", "DESC"]],
      limit: Math.min(5, limit),
      include: [{ model: User, as: "user", attributes: ["fullName"] }]
    });

    const fromExited: AdminGroupActivityItem[] = exitedMembers.map((m) => {
      const mw = m as GMWithUser;
      const name = mw.user?.fullName ?? "Member";
      return {
        type: "member_exited" as const,
        at: m.updatedAt.toISOString(),
        summary: `${name} exited the group`,
        amount: null,
        loanId: null
      };
    });

    const merged = [
      ...fromRepayments,
      ...fromLoans,
      ...fromApproved,
      ...fromDisbursed,
      ...fromJoined,
      ...fromExited
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return merged.slice(0, limit);
  }

  getEligibilityCertificateStub(groupId: string): {
    available: boolean;
    documentUrl: string | null;
    message: string;
  } {
    return {
      available: false,
      documentUrl: null,
      message: `Eligibility certificate for group ${groupId} is not generated by the API yet.`
    };
  }

  async patchGroup(
    groupId: string,
    patch: {
      name?: string;
      description?: string;
      status?: GroupStatus;
      credibilityScore?: number;
      credibilityLevel?: CredibilityLevel;
      maximumAmount?: number | null;
      minimumAmount?: number | null;
      repaymentPeriod?: number | null;
      repaymentType?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | null;
      interestType?: "flat" | "reducingBalance" | null;
      interest?: number | null;
      penalCharges?: number | null;
      gracePeriod?: number | null;
      gracePeriodType?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | null;
      overGracePenalCharges?: number | null;
      targetCredit?: number;
      currentCreditPool?: number;
      creditFrozen?: boolean;
    }
  ): Promise<Group> {
    const existing = await this.groupDao.findById(groupId);
    if (!existing) throw new HttpError(404, "Group not found");
    await this.groupDao.updateGroup(groupId, patch);
    const updated = await this.groupDao.findById(groupId);
    if (!updated) throw new HttpError(404, "Group not found");
    return updated;
  }

  async createGroupAsAdmin(input: CreateGroupInput): Promise<Group> {
    const creator = await this.userDao.findById(input.creatorId);
    if (!creator) throw new HttpError(400, "createdByUserId must be an existing user");
    return this.groupService.createGroup(input);
  }
}
