import { randomBytes } from "node:crypto";
import { Transaction } from "sequelize";
import { AccountDao } from "../dao/account.dao.js";
import { DirectDebitMandateDao } from "../dao/direct-debit-mandate.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { MandateDao } from "../dao/mandate.dao.js";
import { MemberMandateDao } from "../dao/member-mandate.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { DirectDebitMandate } from "../models/index.js";
import { AccountStatus, GroupMemberStatus, MandateStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { decryptBvn } from "../utils/encryption.js";
import {
  initiateBvn,
  sendBvnOtp,
  filterBvnMethod,
  createMonoCustomer,
  fetchBvnDetails,
  createPaymentMandate
} from "./mono.client.js";

const RESEND_THROTTLE_HOURS = 3;
const DEFAULT_MAX_DEBIT_AMOUNT_NGN = 1_000_000;
const MANDATE_AMOUNT_BUFFER_RATIO = 1.3;
const MANDATE_END_DAYS_EXTRA = 60;

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
    maxDebitAmountNgn: number | undefined,
    transaction?: Transaction
  ): Promise<DirectDebitMandate> {
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

    const amountNgn = maxDebitAmountNgn ?? DEFAULT_MAX_DEBIT_AMOUNT_NGN;
    const amountKobo = Math.round(amountNgn * MANDATE_AMOUNT_BUFFER_RATIO * 100);
    const startDate = formatDate(groupMandate.startDate);
    const endDateExtra = new Date(groupMandate.endDate);
    endDateExtra.setDate(endDateExtra.getDate() + MANDATE_END_DAYS_EXTRA);
    const endDate = formatDate(endDateExtra);

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
        await this.accountDao.create(
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
      }
    }

    const updated = await this.directDebitMandateDao.setActive(mandateId, transaction);
    return updated!;
  }

  /** Confirm mandate as ACTIVE (simple; use confirmWithOtp for full OTP + accounts flow). */
  async confirmMandate(mandateId: string, userId: string, transaction?: Transaction): Promise<DirectDebitMandate> {
    const mandate = await this.directDebitMandateDao.findById(mandateId, transaction);
    if (!mandate) throw new HttpError(404, "Mandate not found");
    if (mandate.userId !== userId) throw new HttpError(403, "Not your mandate");
    if (mandate.status !== MandateStatus.INACTIVE) {
      throw new HttpError(400, "Mandate is not pending confirmation");
    }
    const updated = await this.directDebitMandateDao.setActive(mandateId, transaction);
    return updated!;
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
