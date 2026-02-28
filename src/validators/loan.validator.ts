import { z } from "../utils/request.js";

export const loanIdParamSchema = z.object({
  id: z.uuid("loan id must be a valid uuid")
});

const loanRequestBaseSchema = z.object({
  amount: z.coerce.number().positive("amount must be > 0"),
  interestRate: z.coerce.number().nonnegative("interestRate must be >= 0"),
  tenorMonths: z.coerce.number().int("tenorMonths must be an integer").positive("tenorMonths must be > 0"),
  loanPin: z.string().length(6, "Loan PIN must be 6 digits").regex(/^\d{6}$/, "Loan PIN must be 6 digits"),
  loanPurpose: z.enum(["PERSONAL", "BUSINESS", "EDUCATION", "EMERGENCY", "OTHER"]).optional()
});

export const individualLoanSchema = loanRequestBaseSchema;

export const groupLoanSchema = loanRequestBaseSchema.extend({
  groupId: z.uuid("groupId must be a valid uuid")
});

export const approveLoanBodySchema = z.object({
  loanPin: z.string().length(6, "Loan PIN must be 6 digits").regex(/^\d{6}$/, "Loan PIN must be 6 digits")
});
