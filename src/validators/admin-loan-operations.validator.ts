import { z } from "../utils/request.js";

export const adminLoanOperationsTabSchema = z.enum([
  "pending",
  "pending_disbursement",
  "active",
  "repayment_schedule",
  "declined"
]);

export const adminLoanOperationsListQuerySchema = z.object({
  tab: adminLoanOperationsTabSchema,
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const adminLoanOperationsExportQuerySchema = z.object({
  tab: adminLoanOperationsTabSchema,
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});
