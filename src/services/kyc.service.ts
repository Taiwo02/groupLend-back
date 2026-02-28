import { KycStatus } from "../models/enums";
import { UserDao } from "../dao/user.dao";
import { UserKycDataDao } from "../dao/user-kyc-data.dao";
import { UserKycOtpDao } from "../dao/user-kyc-otp.dao";
import { StatementDao } from "../dao/statement.dao";
import { HttpError } from "../utils/http-error";
import { lookupNin } from "./nin.client";
import { sendOtpToPhone } from "./otp-sender.service";
import { generateOtp, hashOtp, verifyOtp, getOtpExpiry, isOtpExpired } from "../utils/otp";
import { ninFullName, ninAddress, type NinLookupData } from "../types/nin";

/** KYC steps: 0 = NIN+OTP, 1 = verify OTP + name, 2 = confirm address, 3 = disbursement account, 4 = employment. Step 5 = submitted. */
export const KYC_MAX_STEP = 5;
const LAST_DATA_STEP = 4;

export type KycStatusResponse = {
  kycStatus: KycStatus;
  kycStep: number;
  submittedAt: string | null;
  data: {
    ninData?: Record<string, unknown> | null;
    address?: Record<string, unknown> | null;
    employmentDetails?: Record<string, unknown> | null;
  };
};

export type SubmitStepPayload =
  | { step: 0; nin: string }
  | { step: 1; otp: string }
  | { step: 2; address: { addressLine1: string; town: string; lga: string; state: string } }
  | { step: 3; code: string; accountId?: string }
  | { step: 4; employmentDetails: { employerName: string; jobTitle: string; employmentStatus: string; monthlyIncome: number } };

export type SubmitStepResult = {
  message: string;
  kycStep: number;
  address?: { addressLine1: string; town: string; lga: string; state: string };
};

export class KycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly userKycOtpDao: UserKycOtpDao,
    private readonly statementDao: StatementDao
  ) {}

  async getStatus(userId: string): Promise<KycStatusResponse> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(401, "User not found");

    const kycData = await this.userKycDataDao.findByUserId(userId);
    return {
      kycStatus: user.kycStatus,
      kycStep: user.kycStep,
      submittedAt: kycData?.submittedAt?.toISOString() ?? null,
      data: {
        ninData: (kycData?.ninData ?? null) as Record<string, unknown> | null,
        address: (kycData?.contact ?? null) as Record<string, unknown> | null,
        employmentDetails: (kycData?.employmentDetails ?? null) as Record<string, unknown> | null
      }
    };
  }

  async submitStep(userId: string, payload: SubmitStepPayload): Promise<SubmitStepResult> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(401, "User not found");

    if (user.kycStatus === KycStatus.APPROVED) {
      return { message: "KYC is already approved", kycStep: user.kycStep };
    }
    if (user.kycStatus === KycStatus.REJECTED) {
      throw new HttpError(400, "KYC was rejected; please contact support");
    }
    if (user.kycStep >= KYC_MAX_STEP) {
      return { message: "KYC already submitted and under review", kycStep: user.kycStep };
    }

    if (payload.step !== user.kycStep) {
      throw new HttpError(400, `Expected step ${user.kycStep}, got ${payload.step}`);
    }

    const nextStep = user.kycStep + 1;
    let result: SubmitStepResult = { message: "Saved successfully", kycStep: nextStep };

    if (payload.step === 0) {
      const ninResult = await lookupNin(payload.nin);
      if (!ninResult.ok || !ninResult.data) {
        throw new HttpError(400, ninResult.message ?? "NIN lookup failed");
      }
      const data = ninResult.data as NinLookupData;
      const phone = data.telephoneno?.trim();
      if (!phone) {
        throw new HttpError(400, "No phone number on NIN record; cannot send OTP");
      }
      const otp = generateOtp();
      const otpHash = await hashOtp(otp);
      await this.userKycOtpDao.upsert(userId, {
        ninData: data,
        otpHash,
        phone,
        expiresAt: getOtpExpiry()
      });
      await sendOtpToPhone(phone, otp);
      result = { message: "OTP sent to your registered number", kycStep: nextStep };
    } else if (payload.step === 1) {
      const otpRow = await this.userKycOtpDao.findByUserId(userId);
      if (!otpRow) throw new HttpError(400, "No pending OTP; please start from step 0 (NIN)");
      if (isOtpExpired(otpRow.expiresAt)) {
        await this.userKycOtpDao.deleteByUserId(userId);
        throw new HttpError(400, "OTP expired; please request a new one from step 0");
      }
      const valid = await verifyOtp(payload.otp, otpRow.otpHash);
      if (!valid) throw new HttpError(400, "Invalid OTP");

      const ninData = otpRow.ninData as NinLookupData;
      const ninName = ninFullName(ninData);
      const userFullName = user.fullName.trim();
      const normalizedNin = ninName.toLowerCase().replace(/\s+/g, " ").trim();
      const normalizedUser = userFullName.toLowerCase().replace(/\s+/g, " ").trim();
      if (normalizedNin !== normalizedUser) {
        throw new HttpError(400, "Name on NIN does not match your account name");
      }

      await this.userKycDataDao.upsert(userId, { ninData: ninData as unknown as Record<string, unknown> });
      await this.userKycOtpDao.deleteByUserId(userId);

      const address = ninAddress(ninData);
      result = {
        message: "OTP verified; please confirm your address",
        kycStep: nextStep,
        address
      };
    } else if (payload.step === 2) {
      await this.userKycDataDao.upsert(userId, {
        contact: payload.address as unknown as { addressLine1: string; town: string; lga: string; state: string }
      });
    } else if (payload.step === 3) {
      await this.saveStatementInfo(userId, payload.code, payload.accountId ?? null);
    } else if (payload.step === 4) {
      await this.userKycDataDao.upsert(userId, { employmentDetails: payload.employmentDetails });
    }

    await this.userDao.updateKycStep(userId, nextStep);

    if (nextStep === KYC_MAX_STEP) {
      await this.userKycDataDao.upsert(userId, { submittedAt: new Date() });
      result.message = "KYC submitted successfully; we will get back to you soon";
    }

    return result;
  }

  private async saveStatementInfo(
    userId: string,
    code: string,
    accountId: string | null
  ): Promise<void> {
    await this.statementDao.createOrUpdate(userId, {
      code,
      accountId: code === "skip" ? null : accountId,
      status: true
    });
  }

  async goBack(userId: string, toStep: number): Promise<{ message: string; kycStep: number }> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(401, "User not found");

    if (user.kycStatus === KycStatus.APPROVED) {
      throw new HttpError(400, "Cannot change steps after KYC is approved");
    }
    if (user.kycStatus === KycStatus.REJECTED) {
      throw new HttpError(400, "KYC was rejected; please contact support");
    }
    if (user.kycStep >= KYC_MAX_STEP) {
      throw new HttpError(400, "Cannot go back after KYC is submitted");
    }

    if (toStep >= user.kycStep) {
      throw new HttpError(400, `toStep must be less than current step (${user.kycStep})`);
    }
    if (toStep < 0 || toStep > LAST_DATA_STEP) {
      throw new HttpError(400, `toStep must be between 0 and ${LAST_DATA_STEP}`);
    }

    if (toStep === 0) {
      await this.userKycOtpDao.deleteByUserId(userId);
    }

    await this.userDao.updateKycStep(userId, toStep);
    return { message: "Moved back to previous step", kycStep: toStep };
  }
}
