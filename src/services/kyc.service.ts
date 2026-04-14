import { Transaction } from "sequelize";
import { sequelize } from "../config/database.js";
import { KycStatus } from "../models/enums.js";
import { User } from "../models/index.js";
import { UserDao } from "../dao/user.dao.js";
import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { KycVerificationDao } from "../dao/kyc-verification.dao.js";
import { StatementDao } from "../dao/statement.dao.js";
import { HttpError } from "../utils/http-error.js";
import { encryptBvn, ninLookupKey } from "../utils/encryption.js";
import type { NinLookupData } from "../types/nin.js";
import type { StatementSyncService } from "./statement-sync.service.js";
import type { CreditService } from "./credit.service.js";

/** KYC steps: 0 = nin + fullName + address + meter fields, 1 = account + BVN + code, 2 = employment. Step 3 = submitted. */
export const KYC_MAX_STEP = 3;
const LAST_DATA_STEP = 2;

export type KycStatusResponse = {
  kycStatus: KycStatus;
  kycStep: number;
  submittedAt: string | null;
  /** Admin comment (e.g. what to update) when KYC is flagged or under review. */
  comment: string | null;
  data: {
    ninData?: Record<string, unknown> | null;
    address?: Record<string, unknown> | null;
    meter?: string | null;
    meterType?: string | null;
    employmentDetails?: Record<string, unknown> | null;
  };
};

export type StepZeroAddress = {
  addressLine1: string;
  town?: string;
  lga?: string;
  state?: string;
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
      address: StepZeroAddress;
      meter: string;
      meterType: "PREPAID";
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
        workAddress?: string;
        workEmail?: string;
        meterNumber?: string;
      };
    };

export type SubmitStepResult = {
  message: string;
  kycStep: number;
};

/** Returns true if at least 2 name parts (words) appear in both strings, in any order. */
function atLeastTwoNamesMatch(fullName: string, accountName: string): boolean {
  const toWords = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
  const fullSet = new Set(toWords(fullName));
  const accountWords = toWords(accountName);
  const matchCount = accountWords.filter((w) => fullSet.has(w)).length;
  return matchCount >= 2;
}

export class KycService {
  constructor(
    private readonly userDao: UserDao,
    private readonly userKycDataDao: UserKycDataDao,
    private readonly kycVerificationDao: KycVerificationDao,
    private readonly statementDao: StatementDao,
    private readonly statementSyncService: StatementSyncService,
    private readonly creditService: CreditService
  ) {}

  async getStatus(userId: string): Promise<KycStatusResponse> {
    const user = await this.userDao.findById(userId);
    if (!user) throw new HttpError(401, "User not found");

    const kycData = await this.userKycDataDao.findByUserId(userId);
    const verification =
      kycData?.id && kycData.submittedAt
        ? await this.kycVerificationDao.findByKycDataId(kycData.id)
        : null;
    return {
      kycStatus: user.kycStatus,
      kycStep: user.kycStep,
      submittedAt: kycData?.submittedAt?.toISOString() ?? null,
      comment: verification?.comment ?? null,
      data: {
        ninData: (kycData?.ninData ?? null) as Record<string, unknown> | null,
        address: (kycData?.contact ?? null) as Record<string, unknown> | null,
        meter: kycData?.meter ?? null,
        meterType: kycData?.meterType ?? null,
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
        contact: payload.address as unknown as Record<string, unknown>,
        meter: payload.meter,
        meterType: payload.meterType
      });
    } else if (payload.step === 1) {
      const userAfter = await this.userDao.findById(userId);
      if (!userAfter) throw new HttpError(401, "User not found");
      if (!atLeastTwoNamesMatch(userAfter.fullName, payload.account.accountName)) {
        throw new HttpError(400, "Account name does not match the your full name");
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
      await this.statementSyncService.saveStatementInfo(userId, payload.code);
    } else if (payload.step === 2) {
      await sequelize.transaction(async (transaction) => {
        const u = await User.findByPk(userId, {
          transaction,
          lock: Transaction.LOCK.UPDATE
        });
        if (!u) throw new HttpError(401, "User not found");

        if (u.kycStatus === KycStatus.APPROVED) {
          result = { message: "KYC is already approved", kycStep: u.kycStep };
          return;
        }
        if (u.kycStatus === KycStatus.REJECTED) {
          throw new HttpError(400, "KYC was rejected; please contact support");
        }
        if (u.kycStep >= KYC_MAX_STEP) {
          result = { message: "KYC already submitted and under review", kycStep: u.kycStep };
          return;
        }
        if (payload.step !== u.kycStep) {
          throw new HttpError(400, `Expected step ${u.kycStep}, got ${payload.step}`);
        }

        const lockedNextStep = u.kycStep + 1;
        await this.userKycDataDao.upsert(userId, { employmentDetails: payload.employmentDetails }, transaction);
        const mi = payload.employmentDetails.monthlyIncome;
        const creditLimit = this.creditService.calculateIndividualCreditLimit(mi);
        await this.userDao.updateProfile(
          userId,
          {
            monthlyIncome: mi,
            employmentStatus: payload.employmentDetails.employmentStatus
          },
          transaction
        );
        await this.userDao.updateCreditLimit(userId, creditLimit, transaction);
        await this.creditService.recalculatePoolsForUserGroups(userId, transaction);
        await this.userDao.updateKycStatus(userId, KycStatus.SUBMITTED, transaction);
        await this.userDao.updateKycStep(userId, lockedNextStep, transaction);

        const draft = await this.userKycDataDao.findDraftByUserId(userId, transaction);
        if (!draft) throw new HttpError(400, "No draft KYC data to submit");
        const submitted = await this.userKycDataDao.createSubmitted(
          userId,
          {
            bioData: draft.bioData,
            contact: draft.contact,
            employmentDetails: draft.employmentDetails,
            meter: draft.meter,
            meterType: draft.meterType,
            profilePicture: draft.profilePicture,
            ninData: draft.ninData,
            bvnEncrypted: draft.bvnEncrypted,
            ninLookupKey: draft.ninLookupKey
          },
          transaction
        );
        await this.kycVerificationDao.upsertByKycDataId(
          submitted.id,
          userId,
          { overallStatus: "PENDING" },
          transaction
        );
        await draft.destroy({ transaction });
        result = {
          message: "KYC submitted successfully; we will get back to you soon",
          kycStep: lockedNextStep
        };
      });
      return result;
    }
    await this.userDao.updateKycStep(userId, nextStep);
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
