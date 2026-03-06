import { z } from "../utils/request.js";

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "fullName is required"),
  email: z.email("email must be valid").trim(),
  password: z.string().min(8, "password must be at least 8 characters"),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  monthlyIncome: z.coerce.number().nonnegative("monthlyIncome must be >= 0"),
  employmentStatus: z.string().trim().min(1, "employmentStatus is required")
});

export const loginSchema = z.object({
  email: z.email("email must be valid").trim(),
  password: z.string().min(1, "password is required")
});

export const submitIncomeSchema = z.object({
  monthlyIncome: z.coerce.number().positive("monthlyIncome must be > 0"),
  employmentStatus: z.string().trim().optional()
});

export const setLoanPinSchema = z.object({
  pin: z.string().length(4, "PIN must be 4 digits").regex(/^\d{4}$/, "PIN must be 4 digits")
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(1, "Verification token is required")
});

export const forgetPasswordSchema = z.object({
  email: z.email("email must be valid").trim()
});

export const setPasswordSchema = z.object({
  token: z.string().trim().min(1, "Reset token is required"),
  password: z.string().min(8, "password must be at least 8 characters")
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters")
});

export const acceptInvitationSchema = z.object({
  signup: signupSchema.optional()
});
