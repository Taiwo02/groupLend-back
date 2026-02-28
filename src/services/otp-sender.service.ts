/**
 * Sends OTP to the given phone number.
 * Replace with real SMS provider (e.g. Twilio, Termii) when ready.
 */
export async function sendOtpToPhone(phone: string, otp: string): Promise<void> {
  // Stub: log in development. In production, call SMS API.
  console.log(`[OTP] Send to ${phone}: ${otp}`);
}
