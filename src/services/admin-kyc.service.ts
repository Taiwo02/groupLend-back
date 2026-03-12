import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { KycVerificationDao } from "../dao/kyc-verification.dao.js";
import { KycStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import type { KycRecordStatus } from "../models/user-kyc-data.model.js";

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
    private readonly kycVerificationDao: KycVerificationDao
  ) {}

  /** Count KYC records where status in (PENDING, SUBMITTED, RESUBMITTED). Optional status or search filter. */
  async getKycCount(status?: KycRecordStatus, search?: string): Promise<AdminKycCountResult> {
    const count = await this.userKycDataDao.countForAdminList({ status, search });
    return { count };
  }

  /** Fetch KYC list (by kycId). Optional status filter or search. */
  async getKycList(opts: {
    status?: KycRecordStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminKycListResult> {
    const [records, total] = await Promise.all([
      this.userKycDataDao.findForAdminList({
        status: opts.status,
        search: opts.search,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0
      }),
      this.userKycDataDao.countForAdminList({ status: opts.status, search: opts.search })
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
}
