import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { GroupDao } from "../dao/group.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Group, GroupMember, User } from "../models/index.js";
import { GroupStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
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

export class AdminGroupsService {
  constructor(
    private readonly groupDao: GroupDao,
    private readonly userDao: UserDao,
    private readonly groupService: GroupService
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
        kycStatus: m.user?.kycStatus ?? "PENDING"
      }));
    let onboardingStatus: AdminGroupOnboardingStatus = "ACTIVE";
    if (group.status === GroupStatus.INACTIVE) onboardingStatus = "FLAGGED";
    else if (group.status === GroupStatus.PENDING) onboardingStatus = "ONBOARDING";
    else if (memberRows.some((m) => m.kycStatus === "FLAGGED")) onboardingStatus = "FLAGGED";
    else if (memberRows.some((m) => m.kycStatus !== "APPROVED")) onboardingStatus = "PENDING_KYC";

    const plain = group.get({ plain: true }) as Record<string, unknown>;

    const memberCount = members.filter(
      (m: MemberWithUser) => m.status === "ACTIVE" || m.status === "INVITED"
    ).length;

    return { group: plain, onboardingStatus, memberCount };
  }

  async patchGroup(
    groupId: string,
    patch: {
      name?: string;
      description?: string;
      status?: GroupStatus;
      maximumAmount?: number | null;
      minimumAmount?: number | null;
      targetCredit?: number;
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
