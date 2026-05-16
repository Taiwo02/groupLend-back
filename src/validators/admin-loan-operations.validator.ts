import { z } from "../utils/request.js";
import { LoanStatus } from "../models/enums.js";

export const adminLoanOperationsTabSchema = z.enum([
  "pending",
  "pending_disbursement",
  "active",
  "repayment_schedule",
  "declined"
]);

const loanStatusEnum = z.enum(Object.values(LoanStatus) as [string, ...string[]]);

export const adminLoanOperationsListBodySchema = z
  .object({
    status: z.array(loanStatusEnum).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.startDate || !data.endDate) return;
    if (new Date(data.startDate).getTime() > new Date(data.endDate).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startDate must be before or equal to endDate",
        path: ["startDate"]
      });
    }
  });

export const adminLoanOperationsExportQuerySchema = z.object({
  tab: adminLoanOperationsTabSchema,
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});
