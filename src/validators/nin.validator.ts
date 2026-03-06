import { z } from "../utils/request.js";

export const ninLookupSchema = z.object({
  nin: z.string().trim().min(11, "NIN must be at least 11 characters")
});

export const ninVerifySchema = z.object({
  nin: z.string().trim().min(11, "NIN must be at least 11 characters"),
  otp: z.string().trim().length(6, "OTP must be 6 digits").regex(/^\d{6}$/, "OTP must be 6 digits")
});
