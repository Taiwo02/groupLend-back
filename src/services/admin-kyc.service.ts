import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { KycVerificationDao } from "../dao/kyc-verification.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { KycStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { decryptBvn } from "../utils/encryption.js";
import {
  lookupNin,
  verifyAddress as monoVerifyAddress,
  getCreditHistoryByBvn,
  getStatement as monoGetStatement
} from "./mono.client.js";

/** Format kycId for display (e.g. KYC-77210). */
function kycIdDisplay(id: string): string {
  const short = id.replace(/-/g, "").slice(-5);
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
  type: "Individual" | "Group Member";
  submissionDate: string;
  documentStatus: string[];
  riskScore: number;
  comment: string | null;
};

export type AdminKycListResult = {
  count: number;
  items: AdminKycListItem[];
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

export class AdminKycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly kycVerificationDao: KycVerificationDao,
    private readonly statementDao: StatementDao
  ) {}

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

    const items: AdminKycListItem[] = records.map((rec, i) => {
      const u = userMap.get(rec.userId);
      const ver = verifications[i];
      const docStatus: string[] = [];
      if (ver?.ninApproved) docStatus.push("✔ NIN Verified");
      else if (rec.ninData) docStatus.push("🟡 NIN Pending");
      if (ver?.bvnApproved) docStatus.push("✔ BVN Verified");
      else if (rec.bvnEncrypted) docStatus.push("🟡 BVN Pending");
      if (ver?.addressApproved) docStatus.push("✔ Address Verified");
      else if (rec.contact) docStatus.push("🟡 Address Pending");
      if (docStatus.length === 0) docStatus.push("↑ Files Received");
      return {
        kycId: rec.id,
        kycIdDisplay: kycIdDisplay(rec.id),
        userId: rec.userId,
        fullName: u?.fullName ?? "Unknown",
        email: u?.email ?? "",
        kycStatus: u?.kycStatus ?? "PENDING",
        type: "Individual",
        submissionDate: rec.submittedAt ? rec.submittedAt.toISOString() : rec.createdAt.toISOString(),
        documentStatus: docStatus,
        riskScore: 0,
        comment: ver?.comment ?? null
      };
    });
    return { count: total, items };
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
  async approveKyc(kycId: string): Promise<{ message: string }> {
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
    return { message: "KYC approved successfully" };
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
    
    const accountId = existing?.accountId ?? (existing?.extraData as Record<string, unknown> | undefined)?.accountId as string | undefined;
    if (!accountId) throw new HttpError(400, "No linked account to fetch statement");
    const result = await monoGetStatement(accountId);
    console.log(result);
    
    if (!result.ok || result.data == null) throw new HttpError(502, result.message ?? "Failed to fetch statement");
    await this.statementDao.createOrUpdate(record.userId, { statement: result.data });
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
}
