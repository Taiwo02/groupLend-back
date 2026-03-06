import { KycStatus } from "../models/enums.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { HttpError } from "../utils/http-error.js";
import { encryptBvn, ninLookupKey } from "../utils/encryption.js";
import type { NinLookupData } from "../types/nin.js";

/** KYC steps: 0 = nin + fullName + address, 1 = account + BVN + code, 2 = employment. Step 3 = submitted. */
export const KYC_MAX_STEP = 3;
const LAST_DATA_STEP = 2;

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

const addressShape = {
  addressLine1: "" as string,
  town: "" as string,
  lga: "" as string,
  state: "" as string
};

const accountShape = {
  accountNumber: "" as string,
  bankName: "" as string,
  bankCode: "" as string,
  accountName: "" as string
};

export type SubmitStepPayload =
  | {
      step: 0;
      nin: string;
      fullName: string;
      address: typeof addressShape;
    }
  | {
      step: 1;
      account: typeof accountShape;
      bvn: string;
      code: string;
    }
  | {
      step: 2;
      employmentDetails: {
        employerName: string;
        jobTitle: string;
        employmentStatus: string;
        monthlyIncome: number;
      };
    };

export type SubmitStepResult = {
  message: string;
  kycStep: number;
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export class KycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
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
      const kycData = await this.userKycDataDao.findByUserId(userId);
      const ninData = kycData?.ninData as NinLookupData | null | undefined;
      if (!ninData?.nin?.trim()) {
        throw new HttpError(400, "NIN must be verified first. Use the NIN verification flow (lookup then verify OTP).");
      }
      const storedNin = String(ninData.nin).trim();
      if (storedNin !== payload.nin.trim()) {
        throw new HttpError(400, "NIN does not match the verified NIN on file");
      }
      await this.userDao.updateFullName(userId, payload.fullName);
      await this.userKycDataDao.upsert(userId, {
        contact: payload.address as unknown as Record<string, unknown>
      });
    } else if (payload.step === 1) {
      const userAfter = await this.userDao.findById(userId);
      if (!userAfter) throw new HttpError(401, "User not found");
      const accountNameNorm = normalizeName(payload.account.accountName);
      const fullNameNorm = normalizeName(userAfter.fullName);
      if (accountNameNorm !== fullNameNorm) {
        throw new HttpError(400, "Account name does not match the customer name on file");
      }
      const kycData = await this.userKycDataDao.findByUserId(userId);
      const ninData = kycData?.ninData as NinLookupData | null | undefined;
      const nin = ninData?.nin?.trim() ?? "";
      if (!nin) {
        throw new HttpError(400, "NIN must be verified before adding account and BVN");
      }
      const bvnEncrypted = encryptBvn(payload.bvn);
      const lookupKey = ninLookupKey(nin);
      await this.userKycDataDao.upsert(userId, {
        bvnEncrypted,
        ninLookupKey: lookupKey
      });
      await this.statementDao.createOrUpdate(userId, {
        code: payload.code,
        accountId: payload.account.accountNumber,
        extraData: { account: payload.account },
        status: true
      });
    } else if (payload.step === 2) {
      await this.userKycDataDao.upsert(userId, { employmentDetails: payload.employmentDetails });
    }

    await this.userDao.updateKycStep(userId, nextStep);

    if (nextStep === KYC_MAX_STEP) {
      await this.userKycDataDao.upsert(userId, { submittedAt: new Date() });
      result.message = "KYC submitted successfully; we will get back to you soon";
    }

    return result;
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

    await this.userDao.updateKycStep(userId, toStep);
    return { message: "Moved back to previous step", kycStep: toStep };
  }
}
