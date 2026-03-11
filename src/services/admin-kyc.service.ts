import { UserDao } from "../dao/user.dao.js";
import { KycVerificationDao } from "../dao/kyc-verification.dao.js";
import { KycStatus } from "../models/enums.js";

export type AdminKycCountResult = { count: number };

export type AdminKycListItem = {
  userId: string;
  fullName: string;
  email: string;
  kycStatus: KycStatus;
  kycStep: number;
  createdAt: string;
  comment: string | null;
};

export type AdminKycListResult = {
  count: number;
  items: AdminKycListItem[];
};

export class AdminKycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly kycVerificationDao: KycVerificationDao
  ) {}

  /** Count KYC where status in (PENDING, SUBMITTED, RESUBMITTED). Optional status or search filter. */
  async getKycCount(status?: KycStatus, search?: string): Promise<AdminKycCountResult> {
    const count = await this.userDao.countForAdminKyc({ status, search });
    return { count };
  }

  /** Fetch KYC list where status in (PENDING, SUBMITTED, RESUBMITTED). Optional status filter or search. */
  async getKycList(opts: {
    status?: KycStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AdminKycListResult> {
    const [users, total] = await Promise.all([
      this.userDao.findForAdminKyc({
        status: opts.status,
        search: opts.search,
        limit: opts.limit ?? 50,
        offset: opts.offset ?? 0
      }),
      this.userDao.countForAdminKyc({ status: opts.status, search: opts.search })
    ]);

    const userIds = users.map((u) => u.id);
    const verifications = await Promise.all(
      userIds.map((id) => this.kycVerificationDao.findByUserId(id))
    );
    const commentByUser = new Map(userIds.map((id, i) => [id, verifications[i]?.comment ?? null]));

    const items: AdminKycListItem[] = users.map((u) => ({
      userId: u.id,
      fullName: u.fullName,
      email: u.email,
      kycStatus: u.kycStatus,
      kycStep: u.kycStep,
      createdAt: u.createdAt.toISOString(),
      comment: commentByUser.get(u.id) ?? null
    }));

    return { count: total, items };
  }
}
