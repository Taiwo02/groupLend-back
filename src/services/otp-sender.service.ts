import { env } from "../config/env.js";

function formatToNigerianMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local10 = digits.slice(-10);
  return `234${local10}`;
}

/**
 * Sends OTP via Termii SMS API.
 */
export async function sendOtpToPhone(phone: string, otp: string): Promise<void> {
  if (!env.smsToken) {
    throw new Error("SMS_TOKEN is required to send OTP SMS");
  }

  const to = formatToNigerianMsisdn(phone);
  if (!/^234\d{10}$/.test(to)) {
    throw new Error("Invalid phone number for OTP delivery");
  }

  const message = `Your Enlace OTP is ${otp}. It expires in 10 minutes.`;
  const payload = {
    api_key: env.smsToken,
    channel: "dnd",
    from: "N-Alert",
    sms: message,
    type: "plain",
    to
  };

  const response = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`OTP SMS failed with status ${response.status}`);
  }
}
