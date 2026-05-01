import { GroupMemberDao } from "../dao/group-member.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { KycVerificationDao } from "../dao/kyc-verification.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { Op } from "sequelize";
import {
  Account,
  DirectDebitMandate,
  Group,
  GroupMember,
  KycVerification,
  Mandate,
  MemberMandate,
  User,
  UserKycData,
  UserMandate
} from "../models/index.js";
import { GroupMemberStatus, KycStatus, MandateStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { decryptBvn } from "../utils/encryption.js";
import {
  lookupNin,
  verifyAddress as monoVerifyAddress,
  getCreditHistoryByBvn,
  getStatement as monoGetStatement,
  getAccounId
} from "./mono.client.js";

/** Format kycId for display (e.g. KYC-77210). */
function kycIdDisplay(id: string): string {
  const short = id.replace(/-/g, "").slice(-5);
  if (!short) return "—";
  return `KYC-${short}`;
}

export type AdminKycCountResult = { count: number };

export type AdminKycListItem = {
  kycId: string;
  kycIdDisplay: string;
  userId: string;
  fullName: string;
  email: string;
  /** User's KYC status (users.kycStatus). */
  kycStatus: string;
  type: "Individual" | "Group";
  is_group: boolean;
  group: {
    id: string;
    groupId: string | null;
    name: string;
  } | null;
  submissionDate: string;
  documentStatus: string[];
  riskScore: number;
  comment: string | null;
};

export type AdminKycListResult = {
  count: number;
  items: AdminKycListItem[];
};

function documentStatusForListItem(rec: UserKycData | null, ver: KycVerification | null): string[] {
  if (!rec) return ["↑ No KYC submitted"];
  const docStatus: string[] = [];
  if (ver?.ninApproved) docStatus.push("\u2714 NIN Verified");
  else if (rec.ninData) docStatus.push("\uD83D\uDFE1 NIN Pending");
  if (ver?.bvnApproved) docStatus.push("\u2714 BVN Verified");
  else if (rec.bvnEncrypted) docStatus.push("\uD83D\uDFE1 BVN Pending");
  if (ver?.addressApproved) docStatus.push("\u2714 Address Verified");
  else if (rec.contact) docStatus.push("\uD83D\uDFE1 Address Pending");
  if (docStatus.length === 0) docStatus.push("↑ Files Received");
  return docStatus;
}

function buildAdminKycListItem(params: {
  userId: string;
  user: User | null | undefined;
  rec: UserKycData | null;
  ver: KycVerification | null;
  type: "Individual" | "Group";
  is_group: boolean;
  group: AdminKycListItem["group"];
  submissionFallback: Date;
  displayOverride?: { fullName?: string; email?: string };
}): AdminKycListItem {
  const { userId, user: u, rec, ver, type, is_group, group, submissionFallback, displayOverride } = params;
  const kycId = rec?.id ?? "";
  const submissionDate = rec
    ? rec.submittedAt
      ? rec.submittedAt.toISOString()
      : rec.createdAt.toISOString()
    : submissionFallback.toISOString();
  return {
    kycId,
    kycIdDisplay: kycIdDisplay(kycId),
    userId,
    fullName: displayOverride?.fullName ?? u?.fullName ?? "Unknown",
    email: displayOverride?.email ?? u?.email ?? "",
    kycStatus: u?.kycStatus ?? KycStatus.PENDING,
    type,
    is_group,
    group,
    submissionDate,
    documentStatus: documentStatusForListItem(rec, ver),
    riskScore: 0,
    comment: ver?.comment ?? null
  };
}

export type AdminGroupMembersKycResult = {
  group: {
    id: string;
    groupId: string | null;
    name: string;
  };
  /** Same shape as each item from `GET /admin/kyc` (individual rows). */
  members: AdminKycListItem[];
};

export type AdminKycDetailsVerification = {
  ninApproved: boolean;
  bvnApproved: boolean;
  addressApproved: boolean;
  creditHistoryApproved: boolean;
  overallStatus: string;
  comment: string | null;
};

export type AdminKycDetailsResult = {
  kycId: string;
  kycIdDisplay: string;
  user: {
    userId: string;
    fullName: string;
    email: string;
    submittedAt: string | null;
  };
  kycData: {
    bioData: Record<string, unknown> | null;
    contact: Record<string, unknown> | null;
    employmentDetails: Record<string, unknown> | null;
    ninData: Record<string, unknown> | null;
    bvnProvided: boolean;
    profilePicture: string | null;
  };
  verification: AdminKycDetailsVerification | null;
};

export type AdminMandateItem = {
  mandateId: string;
  mandateType: "Individual" | "Group";
  status: MandateStatus;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  group: {
    id: string;
    name: string;
  } | null;
  accounts: Array<{
    id: string;
    accountNumber: string | null;
    bankCode: string | null;
    status: string;
    reference: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type AdminMandateListResult = {
  count: number;
  items: AdminMandateItem[];
};

export class AdminKycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly kycVerificationDao: KycVerificationDao,
    private readonly statementDao: StatementDao,
    private readonly groupMemberDao: GroupMemberDao
  ) {}

  async getUnfinishedMandates(opts: {
    type?: "individual" | "group";
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminMandateListResult> {
    return this.getMandatesByStatuses(
      [
        MandateStatus.INACTIVE,
        MandateStatus.INPROGRESS,
        MandateStatus.FAILED,
        MandateStatus.CANCELED
      ],
      opts
    );
  }

  async getCompletedMandates(opts: {
    type?: "individual" | "group";
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminMandateListResult> {
    return this.getMandatesByStatuses([MandateStatus.COMPLETED], opts);
  }

  async reviewCompletedMandate(
    mandateId: string,
    action: "approve" | "revert",
    comment?: string
  ): Promise<{ message: string }> {
    const mandate = await DirectDebitMandate.findByPk(mandateId);
    if (!mandate) throw new HttpError(404, "Mandate not found");
    if (mandate.status !== MandateStatus.COMPLETED) {
      throw new HttpError(400, "Only COMPLETED mandates can be reviewed");
    }

    if (action === "approve") {
      await mandate.update({
        status: MandateStatus.APPROVED,
        adminReviewComment: null
      });
      return { message: "Mandate approved successfully" };
    }

    const reviewComment = comment?.trim();
    if (!reviewComment) {
      throw new HttpError(400, "comment is required when action is revert");
    }

    await mandate.update({
      status: MandateStatus.INACTIVE,
      adminReviewComment: reviewComment
    });
    return { message: "Mandate reverted successfully" };
  }

  /** Count KYC records. Optional users.kycStatus filter and search. No filter = all records. */
  async getKycCount(userKycStatus?: KycStatus, search?: string): Promise<AdminKycCountResult> {
    const count = await this.userKycDataDao.countForAdminList({ userKycStatus, search });
    return { count };
  }

  /** Fetch KYC list. Optional `status` query = users.kycStatus; omit for all KYC records. */
  async getKycList(opts: {
    userKycStatus?: KycStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminKycListResult> {
    const [records, total] = await Promise.all([
      this.userKycDataDao.findForAdminList({
        userKycStatus: opts.userKycStatus,
        search: opts.search,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0
      }),
      this.userKycDataDao.countForAdminList({ userKycStatus: opts.userKycStatus, search: opts.search })
    ]);
    if (records.length === 0) return { count: total, items: [] };

    const userIds = [...new Set(records.map((r) => r.userId))];
    const users = await Promise.all(userIds.map((id) => this.userDao.findById(id)));
    const userMap = new Map(userIds.map((id, i) => [id, users[i]]));
    const verifications = await Promise.all(
      records.map((r) => this.kycVerificationDao.findByKycDataId(r.id))
    );

    const items: AdminKycListItem[] = [];
    const seenGroupIds = new Set<string>();
    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];
      const u = userMap.get(rec.userId);
      const ver = verifications[i];

      const memberships = ((u as unknown as { groups?: Array<{
        status?: string;
        groupId?: string;
        group?: { id: string; groupId: string | null; name: string };
      }> | undefined })?.groups ?? []);

      const activeMembership = memberships.find((m) => m.status === GroupMemberStatus.ACTIVE && m.group);
      const fallbackMembership = memberships.find((m) => m.group);
      const membership = activeMembership ?? fallbackMembership;

      if (!membership?.group?.id) {
        items.push(
          buildAdminKycListItem({
            userId: rec.userId,
            user: u,
            rec,
            ver,
            type: "Individual",
            is_group: false,
            group: null,
            submissionFallback: rec.createdAt
          })
        );
        continue;
      }

      const grp = membership.group;
      if (seenGroupIds.has(grp.id)) continue;
      seenGroupIds.add(grp.id);

      items.push(
        buildAdminKycListItem({
          userId: rec.userId,
          user: u,
          rec,
          ver,
          type: "Group",
          is_group: true,
          group: {
            id: grp.id,
            groupId: grp.groupId,
            name: grp.name
          },
          submissionFallback: rec.createdAt,
          displayOverride: { fullName: grp.name, email: "" }
        })
      );
    }
    return { count: total, items };
  }

  async getGroupMembersKyc(groupId: string): Promise<AdminGroupMembersKycResult> {
    const groupRow = await Group.findByPk(groupId, {
      attributes: ["id", "groupId", "name"],
      include: [
        {
          model: GroupMember,
          as: "members",
          required: false,
          where: { status: { [Op.in]: [GroupMemberStatus.ACTIVE, GroupMemberStatus.INVITED] } },
          attributes: ["id", "userId", "status", "createdAt"],
          include: [
            {
              model: User,
              as: "user",
              attributes: ["id", "fullName", "email", "kycStatus"]
            }
          ]
        }
      ]
    });
    if (!groupRow) throw new HttpError(404, "Group not found");

    type GroupMemberWithUser = GroupMember & { user?: User | null };
    const group = groupRow as Group & { members?: GroupMemberWithUser[] };
    const members = [...(group.members ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const userIds = [...new Set(members.map((m) => m.userId))];

    const kycRecords = userIds.length > 0
      ? await UserKycData.findAll({
          where: { userId: { [Op.in]: userIds } },
          order: [["submittedAt", "DESC"], ["createdAt", "DESC"]]
        })
      : [];

    const latestKycByUser = new Map<string, UserKycData>();
    for (const record of kycRecords) {
      if (!latestKycByUser.has(record.userId)) {
        latestKycByUser.set(record.userId, record);
      }
    }

    const latestKycIds = [...latestKycByUser.values()].map((r) => r.id);
    const verifications = latestKycIds.length > 0
      ? await KycVerification.findAll({ where: { kycDataId: { [Op.in]: latestKycIds } } })
      : [];
    const verificationByKycId = new Map(verifications.map((v) => [v.kycDataId, v]));

    const data: AdminKycListItem[] = members.map((member) => {
      const user = member.user;
      const latest = latestKycByUser.get(member.userId) ?? null;
      const verification = latest ? verificationByKycId.get(latest.id) ?? null : null;
      return buildAdminKycListItem({
        userId: member.userId,
        user,
        rec: latest,
        ver: verification,
        type: "Individual",
        is_group: false,
        group: null,
        submissionFallback: member.createdAt
      });
    });

    return {
      group: { id: group.id, groupId: group.groupId, name: group.name },
      members: data
    };
  }

  /** Get full KYC details by kycId (admin). BVN is not returned; only bvnProvided flag. */
  async getKycDetails(kycId: string): Promise<AdminKycDetailsResult> {
    const [record, verification] = await Promise.all([
      this.userKycDataDao.findById(kycId),
      this.kycVerificationDao.findByKycDataId(kycId)
    ]);
    if (!record) throw new HttpError(404, "KYC record not found");
    const user = await this.userDao.findById(record.userId);
    if (!user) throw new HttpError(404, "User not found");

    return {
      kycId: record.id,
      kycIdDisplay: kycIdDisplay(record.id),
      user: {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        submittedAt: record.submittedAt?.toISOString() ?? null
      },
      kycData: {
        bioData: (record.bioData ?? null) as Record<string, unknown> | null,
        contact: (record.contact ?? null) as Record<string, unknown> | null,
        employmentDetails: (record.employmentDetails ?? null) as Record<string, unknown> | null,
        ninData: (record.ninData ?? null) as Record<string, unknown> | null,
        bvnProvided: !!(record.bvnEncrypted?.trim()),
        profilePicture: record.profilePicture ?? null
      },
      verification: verification
        ? {
            ninApproved: verification.ninApproved,
            bvnApproved: verification.bvnApproved,
            addressApproved: verification.addressApproved,
            creditHistoryApproved: verification.creditHistoryApproved,
            overallStatus: verification.overallStatus,
            comment: verification.comment
          }
        : null
    };
  }

  /** Approve KYC by kycId: update record status, verification flags, and user kycStatus. */
  /**
   * Approve KYC. Optional `creditLimit` updates `users.creditLimit` only when the user has no **active** group
   * membership (individual borrowers). Group members ignore `creditLimit`.
   */
  async approveKyc(
    kycId: string,
    opts?: { creditLimit?: number }
  ): Promise<{ message: string; creditLimitUpdated?: boolean }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    if (record.status === "APPROVED") return { message: "KYC is already approved" };
    if (record.status === "REJECTED") throw new HttpError(400, "Cannot approve rejected KYC");

    await this.userKycDataDao.updateStatus(kycId, "APPROVED");
    await this.kycVerificationDao.upsertByKycDataId(record.id, record.userId, {
      ninApproved: true,
      bvnApproved: true,
      addressApproved: true,
      creditHistoryApproved: true,
      overallStatus: "APPROVED",
      comment: null
    });
    await this.userDao.updateKycStatus(record.userId, KycStatus.APPROVED);

    let creditLimitUpdated: boolean | undefined;
    if (opts?.creditLimit !== undefined) {
      const lim = opts.creditLimit;
      if (typeof lim !== "number" || !Number.isFinite(lim) || lim < 0) {
        throw new HttpError(400, "creditLimit must be a non-negative number");
      }
      const activeGroupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(record.userId);
      if (activeGroupIds.length === 0) {
        await this.userDao.updateCreditLimit(record.userId, lim);
        creditLimitUpdated = true;
      } else {
        creditLimitUpdated = false;
      }
    }

    return { message: "KYC approved successfully", ...(creditLimitUpdated !== undefined && { creditLimitUpdated }) };
  }

  /** Reject KYC by kycId. Optionally set comment for the user. */
  async rejectKyc(kycId: string, comment?: string | null): Promise<{ message: string }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    if (record.status === "REJECTED") return { message: "KYC is already rejected" };
    if (record.status === "APPROVED") throw new HttpError(400, "Cannot reject approved KYC");

    await this.userKycDataDao.updateStatus(kycId, "REJECTED");
    await this.kycVerificationDao.upsertByKycDataId(record.id, record.userId, {
      overallStatus: "REJECTED",
      comment: comment ?? null
    });
    await this.userDao.updateKycStatus(record.userId, KycStatus.REJECTED);
    return { message: "KYC rejected" };
  }

  /** Verify address via third-party; updates kyc_verifications.addressApproved. */
  async verifyAddress(kycId: string): Promise<{ ok: boolean; message?: string }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    const address = (record.contact ?? {}) as Record<string, unknown>;
    const result = await monoVerifyAddress(address);
    await this.kycVerificationDao.upsertByKycDataId(record.id, record.userId, {
      addressApproved: result.ok
    });
    return { ok: result.ok, message: result.message };
  }

  /** Verify credit history via third-party (Mono BVN lookup). Skips API call if already verified to avoid cost. */
  async verifyCreditHistory(kycId: string): Promise<{ ok: boolean; message?: string }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    const verification = await this.kycVerificationDao.findByKycDataId(kycId);
    if (verification?.creditHistoryApproved) {
      return { ok: true, message: "Credit history already verified" };
    }
    const bvnEncrypted = record.bvnEncrypted?.trim();
    if (!bvnEncrypted) throw new HttpError(400, "No BVN on KYC record to verify credit history");
    let bvn: string;
    try {
      bvn = decryptBvn(bvnEncrypted);
    } catch {
      throw new HttpError(400, "Could not decrypt BVN for credit history verification");
    }
    const result = await getCreditHistoryByBvn(bvn);
    await this.kycVerificationDao.upsertByKycDataId(record.id, record.userId, {
      creditHistoryApproved: result.ok
    });
    return { ok: result.ok, message: result.message };
  }

  /** Fetch statement: from DB if present, else fetch via third-party, save and return. */
  async fetchStatement(kycId: string): Promise<{ statement: Record<string, unknown>; fromCache: boolean }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    const existing = await this.statementDao.findByUserId(record.userId);
    const hasData = existing?.statement && typeof existing.statement === "object" && Object.keys(existing.statement).length > 0;
    if (hasData && existing!.statement) {
      return { statement: existing!.statement as Record<string, unknown>, fromCache: true };
    }
    
    // const accountId = existing?.accountId ?? (existing?.extraData as Record<string, unknown> | undefined)?.accountId as string | undefined;
    // if (!accountId) throw new HttpError(400, "No linked account to fetch statement");
    const accountId = await getAccounId(existing?.code ?? "");
    if (!accountId) throw new HttpError(400, "No linked account to fetch statement");
    const result = await monoGetStatement(accountId);
    if (!result.ok || result.data == null) throw new HttpError(502, result.message ?? "Failed to fetch statement");
    await this.statementDao.createOrUpdate(record.userId, { statement: result.data, accountId: accountId });
    return { statement: result.data, fromCache: false };
  }

  /** Verify NIN via third-party; updates kyc_verifications.ninApproved. */
  async verifyNin(kycId: string): Promise<{ ok: boolean; message?: string }> {
    const record = await this.userKycDataDao.findById(kycId);
    if (!record) throw new HttpError(404, "KYC record not found");
    const ninData = record.ninData as { nin?: string } | null | undefined;
    const nin = ninData?.nin?.trim();
    if (!nin) throw new HttpError(400, "No NIN on KYC record");
    const result = await lookupNin(nin);
    await this.kycVerificationDao.upsertByKycDataId(record.id, record.userId, {
      ninApproved: result.ok
    });
    return { ok: result.ok, message: result.message };
  }

  private async getMandatesByStatuses(
    statuses: MandateStatus[],
    opts: {
      type?: "individual" | "group";
      search?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<AdminMandateListResult> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);
    const where: Record<string | symbol, unknown> = {
      status: { [Op.in]: statuses }
    };

    if (opts.type === "group") {
      where.groupId = { [Op.ne]: null };
    } else if (opts.type === "individual") {
      where.groupId = { [Op.is]: null };
    }

    const search = opts.search?.trim();
    if (search) {
      where[Op.or] = [
        { "$user.fullName$": { [Op.iLike]: `%${search}%` } },
        { "$user.email$": { [Op.iLike]: `%${search}%` } },
        { "$group.name$": { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { rows, count } = await DirectDebitMandate.findAndCountAll({
      where,
      include: [
        { association: "user", attributes: ["id", "fullName", "email"], required: true },
        { association: "group", attributes: ["id", "name"], required: false }
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true
    });

    const mandates = rows as Array<
      DirectDebitMandate & {
        user?: Pick<User, "id" | "fullName" | "email">;
        group?: Pick<Group, "id" | "name"> | null;
      }
    >;
    const accountsByMandateId = await this.getAccountsByDirectDebitMandate(mandates);

    const items: AdminMandateItem[] = mandates.map((mandate) => {
      return {
        mandateId: mandate.id,
        mandateType: mandate.groupId ? "Group" : "Individual",
        status: mandate.status,
        comment: mandate.adminReviewComment ?? null,
        createdAt: mandate.createdAt.toISOString(),
        updatedAt: mandate.updatedAt.toISOString(),
        user: {
          id: mandate.user?.id ?? mandate.userId,
          fullName: mandate.user?.fullName ?? "Unknown",
          email: mandate.user?.email ?? ""
        },
        group: mandate.group
          ? {
              id: mandate.group.id,
              name: mandate.group.name
            }
          : null,
        accounts: accountsByMandateId.get(mandate.id) ?? []
      };
    });

    return { count, items };
  }

  private async getAccountsByDirectDebitMandate(
    mandates: Array<
      DirectDebitMandate & {
        user?: Pick<User, "id" | "fullName" | "email">;
        group?: Pick<Group, "id" | "name"> | null;
      }
    >
  ): Promise<Map<string, AdminMandateItem["accounts"]>> {
    const byMandateId = new Map<string, AdminMandateItem["accounts"]>();
    if (mandates.length === 0) return byMandateId;

    const groupedMandates = mandates.filter((m) => !!m.groupId);
    const individualMandates = mandates.filter((m) => !m.groupId);

    const groupKeyToMandateIds = new Map<string, string[]>();
    for (const mandate of groupedMandates) {
      const key = `${mandate.userId}:${mandate.groupId}`;
      const existing = groupKeyToMandateIds.get(key);
      if (existing) existing.push(mandate.id);
      else groupKeyToMandateIds.set(key, [mandate.id]);
    }

    const individualUserIdToMandateIds = new Map<string, string[]>();
    for (const mandate of individualMandates) {
      const existing = individualUserIdToMandateIds.get(mandate.userId);
      if (existing) existing.push(mandate.id);
      else individualUserIdToMandateIds.set(mandate.userId, [mandate.id]);
    }

    if (groupKeyToMandateIds.size > 0) {
      const groupUserIds = [...new Set(groupedMandates.map((m) => m.userId))];
      const groupIds = [...new Set(groupedMandates.map((m) => m.groupId).filter((id): id is string => !!id))];
      const rows = await Account.findAll({
        include: [
          {
            model: MemberMandate,
            as: "memberMandate",
            required: true,
            attributes: ["id", "userId"],
            where: { userId: { [Op.in]: groupUserIds } },
            include: [
              {
                model: Mandate,
                as: "mandate",
                required: true,
                attributes: ["id", "groupId"],
                where: { groupId: { [Op.in]: groupIds } }
              }
            ]
          }
        ],
        order: [["createdAt", "DESC"]]
      });

      for (const row of rows) {
        const account = row as Account & {
          memberMandate?: (MemberMandate & { mandate?: Mandate | null }) | null;
        };
        const memberMandate = account.memberMandate;
        const groupId = memberMandate?.mandate?.groupId ?? null;
        if (!memberMandate?.userId || !groupId) continue;

        const key = `${memberMandate.userId}:${groupId}`;
        const mandateIds = groupKeyToMandateIds.get(key);
        if (!mandateIds || mandateIds.length === 0) continue;

        const serialized = this.serializeAdminMandateAccount(account);
        for (const mandateId of mandateIds) {
          const existing = byMandateId.get(mandateId);
          if (existing) existing.push(serialized);
          else byMandateId.set(mandateId, [serialized]);
        }
      }
    }

    if (individualUserIdToMandateIds.size > 0) {
      const userIds = [...individualUserIdToMandateIds.keys()];
      const rows = await Account.findAll({
        include: [
          {
            model: UserMandate,
            as: "userMandate",
            required: true,
            attributes: ["id", "userId"],
            where: { userId: { [Op.in]: userIds } }
          }
        ],
        order: [["createdAt", "DESC"]]
      });

      for (const row of rows) {
        const account = row as Account & { userMandate?: UserMandate | null };
        const userId = account.userMandate?.userId;
        if (!userId) continue;

        const mandateIds = individualUserIdToMandateIds.get(userId);
        if (!mandateIds || mandateIds.length === 0) continue;

        const serialized = this.serializeAdminMandateAccount(account);
        for (const mandateId of mandateIds) {
          const existing = byMandateId.get(mandateId);
          if (existing) existing.push(serialized);
          else byMandateId.set(mandateId, [serialized]);
        }
      }
    }

    return byMandateId;
  }

  private serializeAdminMandateAccount(account: Account): AdminMandateItem["accounts"][number] {
    return {
      id: account.id,
      accountNumber: account.accountNumber ?? null,
      bankCode: account.bankCode ?? null,
      status: account.status,
      reference: account.reference ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    };
  }
}
