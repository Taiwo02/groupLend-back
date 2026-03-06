import { UserKycDataDao } from "../dao/user-kyc-data.dao.js";
import { UserKycOtpDao } from "../dao/user-kyc-otp.dao.js";
import { HttpError } from "../utils/http-error.js";
import { lookupNin } from "./mono.client.js";
import { sendOtpToPhone } from "./otp-sender.service.js";
import { generateOtp, hashOtp, verifyOtp, getOtpExpiry, isOtpExpired } from "../utils/otp.js";
import { NinLookupData } from "../types/nin.js";

export type NinLookupPayload = { nin: string };
export type NinVerifyPayload = { nin: string; otp: string };

export type NinLookupResult = { message: string };
export type NinVerifyResult = { message: string; ninData: Record<string, unknown> };

export class NinService {
  constructor(
    private readonly userKycDataDao: UserKycDataDao,
    private readonly userKycOtpDao: UserKycOtpDao
  ) {}

  /** Submit NIN: lookup, send OTP to phone on record, store ninData in pending OTP row. */
  async lookup(userId: string, payload: NinLookupPayload): Promise<NinLookupResult> {
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
    return { message: "OTP sent to your registered number" };
  }

  /** Verify OTP and persist ninData to user_kyc_data (same place as before). */
  async verify(userId: string, payload: NinVerifyPayload): Promise<NinVerifyResult> {
    const otpRow = await this.userKycOtpDao.findByUserId(userId);
    if (!otpRow) throw new HttpError(400, "No pending NIN verification; please submit NIN first");
    if (isOtpExpired(otpRow.expiresAt)) {
      await this.userKycOtpDao.deleteByUserId(userId);
      throw new HttpError(400, "OTP expired; please request a new one");
    }
    const valid = await verifyOtp(payload.otp, otpRow.otpHash);
    if (!valid) throw new HttpError(400, "Invalid OTP");

    const ninData = otpRow.ninData as NinLookupData;
    const storedNin = (ninData.nin ?? "").trim();
    const requestedNin = payload.nin.trim();
    if (storedNin !== requestedNin) {
      throw new HttpError(400, "NIN does not match the one we sent OTP for");
    }

    await this.userKycDataDao.upsert(userId, {
      ninData: ninData as unknown as Record<string, unknown>
    });
    await this.userKycOtpDao.deleteByUserId(userId);

    return {
      message: "NIN verified successfully",
      ninData: ninData as unknown as Record<string, unknown>
    };
  }
}
