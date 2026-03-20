import { randomBytes } from "node:crypto";
import { Transaction } from "sequelize";
import { AccountDao } from "../dao/account.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { MandateDao } from "../dao/mandate.dao.js";
import { MemberMandateDao } from "../dao/member-mandate.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { Account, DirectDebitMandate, Mandate } from "../models/index.js";
import { AccountStatus, GroupMemberStatus, MandateStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { decryptBvn } from "../utils/encryption.js";
import {
  initiateBvn,
  sendBvnOtp,
  filterBvnMethod,
  createMonoCustomer,
  fetchBvnDetails,
  createPaymentMandate,
  retrievePaymentMandate
} from "./mono.client.js";

const RESEND_THROTTLE_HOURS = 3;
const DEFAULT_MAX_DEBIT_AMOUNT_NGN = 1_000_000;
const MANDATE_AMOUNT_BUFFER_RATIO = 1.3;
const MANDATE_END_DAYS_EXTRA = 60;
const ACCOUNT_MANDATE_REFRESH_HOURS = 3;

export type GetMandateResult = {
  id: string;
  groupId: string | null;
  status: string;
  createdAt: string;
};

export type AuthorizeMandateResult = {
  ok: boolean;
  message: string;
  data?: { sessionId?: string } | null;
};

export class DirectDebitMandateService {
  constructor(
    private readonly directDebitMandateDao: DirectDebitMandateDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly groupDao: GroupDao,
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly mandateDao: MandateDao,
    private readonly memberMandateDao: MemberMandateDao,
    private readonly accountDao: AccountDao
  ) {}

  /** Get current user's direct debit mandate for a group. Returns null if none. */
  async getMandateForUserAndGroup(
    userId: string,
    groupId: string,
    transaction?: Transaction
  ): Promise<GetMandateResult | null> {
    const membership = await this.groupMemberDao.findByGroupAndUser(groupId, userId, transaction);
    if (!membership || membership.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "Not an active member of this group");
    }
    const mandate = await this.directDebitMandateDao.findByUserAndGroup(userId, groupId, transaction);
    if (!mandate) return null;
    return {
      id: mandate.id,
      groupId: mandate.groupId ?? null,
      status: mandate.status,
      createdAt: mandate.createdAt.toISOString()
    };
  }

  /** Create a direct debit mandate for the user and group (status INACTIVE). User must be active member. Only one mandate per user per group. */
  async createMandate(userId: string, groupId: string, transaction?: Transaction): Promise<DirectDebitMandate> {
    const membership = await this.groupMemberDao.findByGroupAndUser(groupId, userId, transaction);
    if (!membership || membership.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "Not an active member of this group");
    }
    const existing = await this.directDebitMandateDao.findByUserAndGroup(userId, groupId, transaction);
    if (existing) {
      if (existing.status === MandateStatus.ACTIVE) {
        const withinYear = this.isWithinYear(existing.createdAt);
        if (withinYear) throw new HttpError(400, "You already have an active direct debit mandate for this group");
      }
      return existing;
    }
    return this.directDebitMandateDao.create({ userId, groupId }, transaction);
  }

  /**
   * Ensures an INACTIVE mandate exists for the user+group, then initiates BVN flow and sends OTP (same as authorize).
   * Use {@link authorizeMandate} only when you already have a mandate id.
   */
  async createAndAuthorizeMandate(
    userId: string,
    groupId: string,
    resend: boolean,
    transaction?: Transaction
  ): Promise<{ mandate: GetMandateResult; authorize: AuthorizeMandateResult }> {
    const mandate = await this.createMandate(userId, groupId, transaction);
    const authorize = await this.authorizeMandate(mandate.id, userId, resend, transaction);
    return {
      mandate: {
        id: mandate.id,
        groupId: mandate.groupId ?? null,
        status: mandate.status,
        createdAt: mandate.createdAt.toISOString()
      },
      authorize
    };
  }

  /**
   * Start or resend BVN authorization (initiate + send OTP). Mandate must be INACTIVE.
   * Uses BVN and phone/email from user's KYC. Throttles resend to once per 3 hours.
   */
  async authorizeMandate(
    mandateId: string,
    userId: string,
    resend: boolean,
    transaction?: Transaction
  ): Promise<AuthorizeMandateResult> {
    const mandate = await this.directDebitMandateDao.findById(mandateId, transaction);
    if (!mandate) throw new HttpError(404, "Mandate not found");
    if (mandate.userId !== userId) throw new HttpError(403, "Not your mandate");

    if (mandate.status !== MandateStatus.INACTIVE) {
      throw new HttpError(400, "You cannot re-authorize this mandate; it is already active or failed");
    }

    if (mandate.lastResendAt) {
      const hoursSince = (Date.now() - mandate.lastResendAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < RESEND_THROTTLE_HOURS) {
        throw new HttpError(400, "Please try again later", { hoursRemaining: Math.ceil(RESEND_THROTTLE_HOURS - hoursSince) });
      }
    }

    const kyc = await this.userKycDataDao.findByUserId(userId, transaction);
    const bvnEncrypted = kyc?.bvnEncrypted?.trim();
    if (!bvnEncrypted) throw new HttpError(400, "Complete KYC with BVN before authorizing direct debit");

    let bvn: string;
    try {
      bvn = decryptBvn(bvnEncrypted);
    } catch {
      throw new HttpError(400, "Could not use stored BVN for authorization");
    }

    const user = await this.userDao.findById(userId, transaction);
    if (!user) throw new HttpError(404, "User not found");
    const phone = (user.phone ?? (kyc?.contact as Record<string, unknown>)?.phone as string) ?? "";
    const email = user.email ?? "";

    const initiateResult = await initiateBvn(bvn, "bank_accounts");
    const status = initiateResult.status as string | undefined;
    if (status !== "successful") {
      return {
        ok: false,
        message: (initiateResult.message as string) ?? "BVN initiation failed",
        data: null
      };
    }

    const data = initiateResult.data as Record<string, unknown> | undefined;
    const sessionId = data?.session_id as string | undefined;
    if (sessionId) {
      await this.directDebitMandateDao.updateSessionAndResend(
        mandateId,
        { monoSessionId: sessionId },
        transaction
      );
    }
    console.log("bvnEncrypted", data);

    const methods = (data?.methods as { method?: string }[] | undefined) ?? [];
    let filterMethod = filterBvnMethod(methods, "phone");
    let bvnValidation = await sendBvnOtp(phone || email, sessionId ?? "", filterMethod?.method ?? "phone");
    if ((bvnValidation.status as string) !== "successful") {
      filterMethod = filterBvnMethod(methods, "email");
      if (filterMethod) {
        const target = filterMethod.method === "email" ? email : phone;
        bvnValidation = await sendBvnOtp(target ?? phone ?? email ?? "", sessionId ?? "", filterMethod.method ?? "phone");
      }
      if ((bvnValidation.status as string) !== "successful") {
        return {
          ok: false,
          message: (bvnValidation.message as string) ?? "Failed to send OTP",
          data: null
        };
      }
    }

    if (resend && (bvnValidation.status as string) === "successful") {
      const ts = bvnValidation.timestamp != null ? new Date(bvnValidation.timestamp as string | number) : new Date();
      await this.directDebitMandateDao.updateSessionAndResend(
        mandateId,
        { lastResendAt: ts },
        transaction
      );
    }

    return {
      ok: true,
      message: (bvnValidation.message as string) ?? "OTP sent",
      data: sessionId ? { sessionId } : null
    };
  }

  /**
   * Confirm with OTP: verify OTP with Mono, fetch BVN-linked accounts, create Mono payment mandate per account
   * and save Account records, then set direct debit mandate ACTIVE. Uses group Mandate (yearly) for Account.mandateId.
   */
  async confirmWithOtp(
    mandateId: string,
    userId: string,
    otp: string,
    transaction?: Transaction
  ): Promise<{ mandate: DirectDebitMandate; accounts: Account[] }> {
    const mandate = await this.directDebitMandateDao.findById(mandateId, transaction);
    if (!mandate) throw new HttpError(404, "Mandate not found");
    if (mandate.userId !== userId) throw new HttpError(403, "Not your mandate");
    if (mandate.status !== MandateStatus.INACTIVE) {
      throw new HttpError(400, "Mandate is not pending confirmation");
    }
    if (!mandate.monoSessionId) throw new HttpError(400, "Authorize first (send OTP) before confirming");

    const groupId = mandate.groupId;
    if (!groupId) throw new HttpError(400, "Mandate has no group");

    const user = await this.userDao.findById(userId, transaction);
    if (!user) throw new HttpError(404, "User not found");
    const kyc = await this.userKycDataDao.findByUserId(userId, transaction);
    const bvnEncrypted = kyc?.bvnEncrypted?.trim();
    if (!bvnEncrypted) throw new HttpError(400, "Complete KYC with BVN before confirming");
    let bvn: string;
    try {
      bvn = decryptBvn(bvnEncrypted);
    } catch {
      throw new HttpError(400, "Could not use stored BVN");
    }

    const currentYear = new Date().getFullYear();
    const groupMandate = await this.mandateDao.findActiveByGroupAndYear(groupId, currentYear, transaction);
    if (!groupMandate) throw new HttpError(400, "No active group mandate for this year");
    const memberMandate = await this.memberMandateDao.findByMandateAndUser(groupMandate.id, userId, transaction);
    if (!memberMandate) throw new HttpError(400, "You are not a member of this group mandate");

    let monoCustomerId = mandate.monoCustomerId ?? user.monoCustomerId ?? null;
    if (!monoCustomerId) {
      const contact = (kyc?.contact ?? {}) as Record<string, unknown>;
      const address = contact.address as string | undefined;
      const parts = (user.fullName || "User").trim().split(/\s+/);
      const firstName = parts[0] ?? "User";
      const lastName = parts.slice(1).join(" ") || firstName;
      const customerRes = await createMonoCustomer({
        bvn,
        email: user.email,
        firstName,
        lastName,
        address: address ?? user.location ?? undefined,
        phone: user.phone ?? undefined
      });
      const custData = customerRes.data as Record<string, unknown> | undefined;
      const existing = custData?.existing_customer as { id?: string } | undefined;
      const newCustomerId = (existing?.id ?? custData?.id) as string | undefined;
      if (!newCustomerId) {
        throw new HttpError(400, (customerRes.message as string) ?? "Failed to create Mono customer");
      }
      monoCustomerId = newCustomerId;
      await this.directDebitMandateDao.updateSessionAndResend(
        mandateId,
        { monoCustomerId },
        transaction
      );
      await user.update({ monoCustomerId }, { transaction });
    }

    if (!monoCustomerId) throw new HttpError(400, "Mono customer ID is required");

    const bvnRes = await fetchBvnDetails(otp, mandate.monoSessionId);
    const status = bvnRes.status as string | undefined;
    if (status !== "successful") {
      throw new HttpError(400, (bvnRes.message as string) ?? "Invalid OTP or BVN details failed");
    }
    const accountsData = (bvnRes.data as unknown[]) ?? [];
    if (accountsData.length === 0) {
      throw new HttpError(400, "No bank accounts returned from BVN lookup");
    }

    const group = await this.groupDao.findById(groupId, transaction);
    if (!group) throw new HttpError(404, "Group not found");
    const amountNgn = this.resolveGroupMaxDebitNgn(group);
    const amountKobo = Math.round(amountNgn * MANDATE_AMOUNT_BUFFER_RATIO * 100);
    const startDate = formatDate(groupMandate.startDate);
    const endDateExtra = new Date(groupMandate.endDate);
    endDateExtra.setDate(endDateExtra.getDate() + MANDATE_END_DAYS_EXTRA);
    const endDate = formatDate(endDateExtra);

    const createdAccounts: Account[] = [];
    for (const item of accountsData) {
      const el = item as Record<string, unknown>;
      const accountNumber = el.account_number as string | undefined;
      const institution = el.institution as Record<string, unknown> | undefined;
      const bankCode = institution?.bank_code as string | undefined;
      if (!accountNumber || !bankCode) continue;
      const reference = "MONO" + randomBytes(8).toString("hex");
      const mandateRes = await createPaymentMandate({
        monoCustomerId,
        accountNumber,
        bankCode,
        amountKobo,
        startDate,
        endDate,
        reference,
        description: "Credit repayment"
      });
      const mandateStatus = mandateRes.status as string | undefined;
      if (mandateStatus === "successful") {
        const data = mandateRes.data as Record<string, unknown> | undefined;
        const row = await this.accountDao.create(
          {
            mandateId: groupMandate.id,
            memberMandateId: memberMandate.id,
            reference: data?.reference as string ?? reference,
            monoCustomerId,
            accountNumber,
            bankCode,
            status: AccountStatus.ACTIVE,
            initiateMandateData: data ?? {}
          },
          transaction
        );
        createdAccounts.push(row);
      }
    }

    if (createdAccounts.length === 0) {
      throw new HttpError(400, "No bank accounts could be linked; check Mono mandate responses");
    }

    const updated = await this.directDebitMandateDao.setActive(mandateId, MandateStatus.INPROGRESS, transaction);
    return { mandate: updated!, accounts: createdAccounts };
  }

  /**
   * Return linked debit account if mandate reference is fresh (&lt; 3h) or account is ACTIVE;
   * otherwise re-initiate Mono payment mandate and persist new reference.
   */
  async getOrRefreshAccountMandate(
    userId: string,
    groupId: string,
    accountId: string
  ): Promise<{ message: string; account: Record<string, unknown> }> {
    const membership = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!membership || membership.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "Not an active member of this group");
    }

    const account = await this.accountDao.findByIdWithMandate(accountId);
    if (!account) throw new HttpError(404, "Record not found");

    const groupMandate = (account as Account & { mandate?: Mandate }).mandate;
    if (!groupMandate || groupMandate.groupId !== groupId) {
      throw new HttpError(403, "Account is not linked to this group");
    }

    if (!account.memberMandateId) throw new HttpError(403, "Invalid account");
    const mm = await this.memberMandateDao.findById(account.memberMandateId);
    if (!mm || mm.userId !== userId) throw new HttpError(403, "Not your account");

    const maxAgeMs = ACCOUNT_MANDATE_REFRESH_HOURS * 60 * 60 * 1000;
    const createdAt = new Date(account.createdAt).getTime();
    const referenceFresh = !!account.reference && Date.now() - createdAt < maxAgeMs;

    if (account.status === AccountStatus.ACTIVE || referenceFresh) {
      return {
        message: "Record",
        account: DirectDebitMandateService.serializeDebitAccount(account)
      };
    }

    if (!account.monoCustomerId || !account.accountNumber || !account.bankCode) {
      throw new HttpError(
        400,
        "Account is missing bank link details; complete direct-debit confirmation first"
      );
    }

    const amountNgn =
      DirectDebitMandateService.toPositiveNgn(groupMandate.totalAccessAmount) ||
      DEFAULT_MAX_DEBIT_AMOUNT_NGN;
    const amountKobo = Math.round(amountNgn * MANDATE_AMOUNT_BUFFER_RATIO * 100);
    const startDate = formatDate(groupMandate.startDate);
    const endExtra = new Date(groupMandate.endDate);
    endExtra.setDate(endExtra.getDate() + MANDATE_END_DAYS_EXTRA);
    const endDate = formatDate(endExtra);
    const reference = "MONO" + randomBytes(8).toString("hex");

    const mandateRes = await createPaymentMandate({
      monoCustomerId: account.monoCustomerId,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      amountKobo,
      startDate,
      endDate,
      reference,
      description: "Credit repayment"
    });

    if ((mandateRes.status as string) !== "successful") {
      throw new HttpError(400, (mandateRes.message as string) ?? "Failed to initiate mandate");
    }

    const resData = (mandateRes.data as Record<string, unknown>) ?? {};
    const newRef = (resData.reference as string) || reference;
    await this.accountDao.updateMandateInitiation(accountId, {
      reference: newRef,
      initiateMandateData: { ...resData, ...mandateRes }
    });

    const refreshed = await this.accountDao.findById(accountId);
    if (!refreshed) throw new HttpError(500, "Account not found after update");
    return {
      message: "Record fetched",
      account: DirectDebitMandateService.serializeDebitAccount(refreshed)
    };
  }

  /** Poll Mono for mandate approval; marks account ACTIVE when approved. */
  async verifyAccountMandate(
    userId: string,
    groupId: string,
    accountId: string
  ): Promise<{ message: string; data: Record<string, unknown> | null }> {
    const membership = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!membership || membership.status !== GroupMemberStatus.ACTIVE) {
      throw new HttpError(403, "Not an active member of this group");
    }

    const account = await this.accountDao.findByIdWithMandate(accountId);
    if (!account) throw new HttpError(404, "Record not found");

    const groupMandate = (account as Account & { mandate?: Mandate }).mandate;
    if (!groupMandate || groupMandate.groupId !== groupId) {
      throw new HttpError(403, "Account is not linked to this group");
    }

    if (!account.memberMandateId) throw new HttpError(403, "Invalid account");
    const mm = await this.memberMandateDao.findById(account.memberMandateId);
    if (!mm || mm.userId !== userId) throw new HttpError(403, "Not your account");

    if (!account.reference?.trim()) {
      throw new HttpError(400, "No mandate reference; call refresh mandate first");
    }

    const remote = await retrievePaymentMandate(account.reference);
    if (!remote) throw new HttpError(502, "Could not verify mandate with payment provider");

    const approved =
      remote.approved === true ||
      remote.approved === "true" ||
      String(remote.status ?? "").toLowerCase() === "approved";

    if (!approved) {
      return { message: "Mandate pending approval", data: null };
    }

    await this.accountDao.updateStatus(accountId, AccountStatus.ACTIVE);

    return { message: "Mandate approved", data: remote };
  }

  /** JSON shape for linked debit accounts (confirm + refresh endpoints). */
  static serializeDebitAccount(account: Account): Record<string, unknown> {
    return {
      id: account.id,
      mandateId: account.mandateId,
      memberMandateId: account.memberMandateId,
      reference: account.reference,
      monoCustomerId: account.monoCustomerId,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      status: account.status,
      initiateMandateData: account.initiateMandateData,
      createdAt: account.createdAt?.toISOString?.() ?? null,
      updatedAt: account.updatedAt?.toISOString?.() ?? null
    };
  }

  /** Confirm mandate as ACTIVE (simple; use confirmWithOtp for full OTP + accounts flow). */
  async confirmMandate(mandateId: string, userId: string, transaction?: Transaction): Promise<DirectDebitMandate> {
    const mandate = await this.directDebitMandateDao.findById(mandateId, transaction);
    if (!mandate) throw new HttpError(404, "Mandate not found");
    if (mandate.userId !== userId) throw new HttpError(403, "Not your mandate");
    if (mandate.status !== MandateStatus.INACTIVE) {
      throw new HttpError(400, "Mandate is not pending confirmation");
    }
    const updated = await this.directDebitMandateDao.setActive(mandateId, MandateStatus.COMPLETED, transaction);
    return updated!;
  }

  /** Max direct-debit coverage from group credit: higher of pool and target, else default. */
  private resolveGroupMaxDebitNgn(group: { currentCreditPool: unknown; targetCredit: unknown }): number {
    const pool = DirectDebitMandateService.toPositiveNgn(group.currentCreditPool);
    const target = DirectDebitMandateService.toPositiveNgn(group.targetCredit);
    const max = Math.max(pool, target);
    return max > 0 ? max : DEFAULT_MAX_DEBIT_AMOUNT_NGN;
  }

  private static toPositiveNgn(value: unknown): number {
    const n = typeof value === "string" ? parseFloat(value) : Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private isWithinYear(date: Date): boolean {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    return date >= oneYearAgo;
  }
}

function formatDate(d: Date): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}
