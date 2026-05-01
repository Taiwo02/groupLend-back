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

export const groupLoanListBodySchema = z.object({
  status: z.array(z.enum(Object.values(LoanStatus) as [string, ...string[]])).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  myLoan: z.boolean().optional().default(false)
}).superRefine((data, ctx) => {
  if (!data.startDate || !data.endDate) return;
  if (new Date(data.startDate).getTime() > new Date(data.endDate).getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must be before or equal to endDate",
      path: ["startDate"]
    });
  }
});
