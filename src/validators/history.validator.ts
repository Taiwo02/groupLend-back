import { z } from "../utils/request.js";

export const historyCategorySchema = z.enum([
  "all",
  "loan_requests",
  "approved",
  "repayments",
  "group",
  "milestones"
]);

export const historyBodySchema = z
  .object({
    category: historyCategorySchema.optional().default("all"),
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
