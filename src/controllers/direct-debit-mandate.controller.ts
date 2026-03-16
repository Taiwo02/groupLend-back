import { Context } from "hono";
import { DirectDebitMandateService } from "../services/direct-debit-mandate.service.js";
import { parseWithSchema } from "../utils/request.js";
import { z } from "zod";

const groupIdParamSchema = z.object({ groupId: z.string().uuid() });
const mandateIdParamSchema = z.object({ mandateId: z.string().uuid() });
const authorizeBodySchema = z.object({ resend: z.boolean().optional().default(false) });
const confirmBodySchema = z.object({
  otp: z.string().min(1, "OTP is required"),
  maxDebitAmount: z.number().positive().optional()
});

export class DirectDebitMandateController {
  constructor(private readonly directDebitMandateService: DirectDebitMandateService) {}

  /** GET /groups/:groupId/direct-debit-mandate */
  async getMandate(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") });
    const userId = c.get("userId");
    const result = await this.directDebitMandateService.getMandateForUserAndGroup(userId, params.groupId);
    if (!result) return c.json({ mandate: null });
    return c.json({ mandate: result });
  }

  /** POST /groups/:groupId/direct-debit-mandate */
  async createMandate(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") });
    const userId = c.get("userId");
    const mandate = await this.directDebitMandateService.createMandate(userId, params.groupId);
    return c.json({ mandate: { id: mandate.id, groupId: mandate.groupId, status: mandate.status, createdAt: mandate.createdAt.toISOString() } }, 201);
  }

  /** POST /groups/:groupId/direct-debit-mandate/:mandateId/authorize */
  async authorizeMandate(c: Context): Promise<Response> {
    const groupId = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") }).groupId;
    const mandateId = parseWithSchema(mandateIdParamSchema, { mandateId: c.req.param("mandateId") }).mandateId;
    const body = await c.req.json().catch(() => ({})) as unknown;
    const { resend } = parseWithSchema(authorizeBodySchema, body);
    const userId = c.get("userId");
    const result = await this.directDebitMandateService.authorizeMandate(mandateId, userId, resend);
    if (!result.ok) return c.json({ ok: false, message: result.message, data: result.data ?? null }, 400);
    return c.json({ ok: result.ok, message: result.message, data: result.data ?? null });
  }

  /** POST /groups/:groupId/direct-debit-mandate/:mandateId/confirm - verify OTP, fetch accounts, create Mono mandates and save accounts. */
  async confirmMandate(c: Context): Promise<Response> {
    const mandateId = parseWithSchema(mandateIdParamSchema, { mandateId: c.req.param("mandateId") }).mandateId;
    const body = await c.req.json().catch(() => ({})) as unknown;
    const { otp, maxDebitAmount } = parseWithSchema(confirmBodySchema, body);
    const userId = c.get("userId");
    const mandate = await this.directDebitMandateService.confirmWithOtp(mandateId, userId, otp, maxDebitAmount);
    return c.json({ mandate: { id: mandate.id, groupId: mandate.groupId, status: mandate.status, createdAt: mandate.createdAt.toISOString() } });
  }
}
