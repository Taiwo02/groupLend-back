import { z } from "../utils/request.js";

export const groupStatsBodySchema = z
  .object({
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
