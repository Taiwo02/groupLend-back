import { z } from "../utils/request.js";

/** Step 0: NIN lookup – we send OTP to phone on NIN */
export const kycStepZeroSchema = z.object({
  nin: z.string().trim().min(11, "NIN must be at least 11 characters")
});

/** Step 1: Verify OTP (name confirmed server-side; we return address from NIN) */
export const kycStepOneSchema = z.object({
  otp: z.string().trim().length(6, "OTP must be 6 digits").regex(/^\d{6}$/, "OTP must be 6 digits")
});

/** Step 2: Confirm address and save */
export const kycStepTwoSchema = z.object({
  address: z.object({
    addressLine1: z.string().trim().min(1, "addressLine1 is required"),
    town: z.string().trim().min(1, "town is required"),
    lga: z.string().trim().min(1, "lga is required"),
    state: z.string().trim().min(1, "state is required")
  })
});

/** Step 3: Disbursement account + saveStatementInfo */
export const kycStepThreeSchema = z.object({
  code: z.string().trim().min(1, "code is required"),
  accountId: z.string().trim().optional()
});

/** Step 4: Employment details */
export const kycStepFourSchema = z.object({
  employmentDetails: z.object({
    employerName: z.string().trim().min(1, "employerName is required"),
    jobTitle: z.string().trim().min(1, "jobTitle is required"),
    employmentStatus: z.string().trim().min(1, "employmentStatus is required"),
    monthlyIncome: z.coerce.number().positive("monthlyIncome must be positive")
  })
});

/** Body for submit-step */
export const kycSubmitStepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal(0), nin: kycStepZeroSchema.shape.nin }),
  z.object({ step: z.literal(1), otp: kycStepOneSchema.shape.otp }),
  z.object({ step: z.literal(2), address: kycStepTwoSchema.shape.address }),
  z.object({
    step: z.literal(3),
    code: kycStepThreeSchema.shape.code,
    accountId: kycStepThreeSchema.shape.accountId
  }),
  z.object({ step: z.literal(4), employmentDetails: kycStepFourSchema.shape.employmentDetails })
]);

/** Go back to a previous step */
export const kycGoBackSchema = z.object({
  toStep: z.coerce.number().int().min(0, "toStep must be >= 0")
});
