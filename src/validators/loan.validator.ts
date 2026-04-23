import { z } from "../utils/request.js";
import { LoanStatus } from "../models/enums.js";

export const loanIdParamSchema = z.object({
  id: z.uuid("loan id must be a valid uuid")
});

const loanRequestBaseSchema = z.object({
  amount: z.coerce.number().positive("amount must be > 0"),
  interestRate: z.coerce.number().nonnegative("interestRate must be >= 0"),
  tenorMonths: z.coerce.number().int("tenorMonths must be an integer").positive("tenorMonths must be > 0"),
  loanPin: z.string().length(4, "Loan PIN must be 4 digits").regex(/^\d{4}$/, "Loan PIN must be 4 digits"),
  loanPurpose: z.enum(["PERSONAL", "BUSINESS", "EDUCATION", "EMERGENCY", "OTHER"]).optional()
});

export const individualLoanSchema = loanRequestBaseSchema;

export const groupLoanSchema = loanRequestBaseSchema.extend({
  groupId: z.uuid("groupId must be a valid uuid")
});

export const approveLoanBodySchema = z.object({
  loanPin: z.string().length(4, "Loan PIN must be 4 digits").regex(/^\d{4}$/, "Loan PIN must be 4 digits")
});

export const groupLoanListQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return value
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean);
    })
    .refine(
      (values) =>
        values == null ||
        values.every((v) => (Object.values(LoanStatus) as string[]).includes(v)),
      "status must be a comma-separated list of valid loan statuses"
    )
});
