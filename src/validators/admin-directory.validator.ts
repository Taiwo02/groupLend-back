import { z } from "../utils/request.js";
import { createGroupSchema } from "./group.validator.js";

export const adminGroupListQuerySchema = z.object({
  q: z.string().optional(),
  onboardingStatus: z.enum(["ACTIVE", "PENDING_KYC", "ONBOARDING", "FLAGGED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const adminGroupExportQuerySchema = z.object({
  q: z.string().optional(),
  onboardingStatus: z.enum(["ACTIVE", "PENDING_KYC", "ONBOARDING", "FLAGGED"]).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional()
});

export const adminCreateGroupBodySchema = createGroupSchema.extend({
  createdByUserId: z.uuid("createdByUserId must be a valid uuid")
});

export const adminPatchGroupBodySchema = z
  .object({
    name: z.string().trim().min(2).optional(),
    description: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
    maximumAmount: z.coerce.number().nonnegative().nullable().optional(),
    minimumAmount: z.coerce.number().nonnegative().nullable().optional(),
    targetCredit: z.coerce.number().nonnegative().optional(),
    currentCreditPool: z.coerce.number().nonnegative().optional(),
    creditFrozen: z.boolean().optional()
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field is required" });

export const adminGroupMembersQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export const adminGroupActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional()
});

export const adminUserListQuerySchema = z.object({
  q: z.string().optional(),
  kycStatus: z
    .enum(["PENDING", "SUBMITTED", "RESUBMITTED", "FLAGGED", "APPROVED", "REJECTED"])
    .optional(),
  creditStatus: z.enum(["LOCKED", "ACTIVE"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});
