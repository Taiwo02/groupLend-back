import { z } from "../utils/request";

const repaymentTypeEnum = z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]);
const interestTypeEnum = z.enum(["flat", "reducingBalance"]);
const groupStatusEnum = z.enum(["ACTIVE", "INACTIVE", "PENDING"]);

export const groupIdParamSchema = z.object({
  id: z.uuid("group id must be a valid uuid")
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(2, "name is required"),
  description: z.string().trim().min(1, "description is required"),
  states: z.array(z.string().trim()).min(1, "at least one state is required"),
  expectedLoan: z.coerce.number().nonnegative("expectedLoan must be >= 0"),
  targetCredit: z.coerce.number().nonnegative().optional(),
  minimumAmount: z.coerce.number().nonnegative().optional(),
  maximumAmount: z.coerce.number().nonnegative().optional(),
  repaymentPeriod: z.coerce.number().int().positive().optional(),
  repaymentType: repaymentTypeEnum.optional(),
  interestType: interestTypeEnum.optional(),
  interest: z.coerce.number().nonnegative().optional(),
  penalCharges: z.coerce.number().nonnegative().optional(),
  gracePeriod: z.coerce.number().int().nonnegative().optional(),
  gracePeriodType: z.string().trim().max(20).optional(),
  overGracePenalCharges: z.coerce.number().nonnegative().optional(),
  ageRange: z.array(z.string().trim()).optional(),
  status: groupStatusEnum.optional()
});

const inviteeSchema = z.object({
  fullName: z.string().trim().min(1, "fullName is required"),
  email: z.string().email("valid email is required"),
  phone: z.string().trim().optional()
});

export const inviteMembersSchema = z.object({
  invites: z.array(inviteeSchema).min(1, "at least one invite is required")
});

// 14c8464d-01a7-4dd6-928f-2d1269f10af5