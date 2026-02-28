import { randomInt } from "node:crypto";
import { hashValue, compareHash } from "./auth.js";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;

export function generateOtp(): string {
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

export async function hashOtp(otp: string): Promise<string> {
  return hashValue(otp);
}

export async function verifyOtp(plain: string, hash: string): Promise<boolean> {
  return compareHash(plain, hash);
}

export function getOtpExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + OTP_EXPIRY_MINUTES);
  return d;
}

export function isOtpExpired(expiresAt: Date): boolean {
  return new Date() >= expiresAt;
}
