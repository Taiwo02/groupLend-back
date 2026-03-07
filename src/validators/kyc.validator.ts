import { z } from "../utils/request.js";

/** Step 0: NIN (already verified) + fullName + address */
export const kycStepZeroSchema = z.object({
  nin: z.string().trim().min(11, "NIN must be at least 11 characters"),
  fullName: z.string().trim().min(1, "fullName is required"),
  address: z.object({
    addressLine1: z.string().trim().min(1, "addressLine1 is required"),
    town: z.string().trim().min(1, "town is required").optional(),
    lga: z.string().trim().min(1, "lga is required").optional(),
    state: z.string().trim().min(1, "state is required").optional()
  })
});

/** Step 1: Account + BVN + statement code */
export const kycStepOneSchema = z.object({
  account: z.object({
    accountNumber: z.string().trim().min(1, "accountNumber is required"),
    bankName: z.string().trim().min(1, "bankName is required"),
    bankCode: z.string().trim().min(1, "bankCode is required"),
    accountName: z.string().trim().min(1, "accountName is required")
  }),
  bvn: z.string().trim().length(11, "BVN must be 11 digits").regex(/^\d{11}$/, "BVN must be 11 digits"),
  code: z.string().trim().min(1, "code is required")
});

/** Step 2: Employment details */
export const kycStepTwoSchema = z.object({
  employmentDetails: z.object({
    employerName: z.string().trim().min(1, "employerName is required"),
    jobTitle: z.string().trim().min(1, "jobTitle is required"),
    employmentStatus: z.string().trim().min(1, "employmentStatus is required"),
    monthlyIncome: z.coerce.number().positive("monthlyIncome must be positive")
  })
});

/** Body for submit-step */
export const kycSubmitStepSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal(0),
    nin: kycStepZeroSchema.shape.nin,
    fullName: kycStepZeroSchema.shape.fullName,
    address: kycStepZeroSchema.shape.address
  }),
  z.object({
    step: z.literal(1),
    account: kycStepOneSchema.shape.account,
    bvn: kycStepOneSchema.shape.bvn,
    code: kycStepOneSchema.shape.code
  }),
  z.object({ step: z.literal(2), employmentDetails: kycStepTwoSchema.shape.employmentDetails })
]);

/** Go back to a previous step (0, 1, or 2) */
export const kycGoBackSchema = z.object({
  toStep: z.coerce.number().int().min(0, "toStep must be >= 0").max(2, "toStep must be <= 2")
});
