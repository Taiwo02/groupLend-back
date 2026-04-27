import { z } from "../utils/request.js";

export const adminMandateListQuerySchema = z.object({
  type: z.enum(["individual", "group"]).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const adminMandateReviewBodySchema = z
  .object({
    action: z.enum(["approve", "revert"]),
    comment: z.string().trim().optional()
  })
  .superRefine((data, ctx) => {
    if (data.action === "revert" && !data.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment is required when action is revert",
        path: ["comment"]
      });
    }
  });
