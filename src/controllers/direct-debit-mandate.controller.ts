import { Context } from "hono";
import { DirectDebitMandateService } from "../services/direct-debit-mandate.service.js";
import { parseWithSchema } from "../utils/request.js";
import { z } from "zod";

const groupIdParamSchema = z.object({ groupId: z.string().uuid() });
const mandateIdParamSchema = z.object({ mandateId: z.string().uuid() });
const accountIdParamSchema = z.object({ accountId: z.string().uuid() });
const authorizeBodySchema = z.object({ resend: z.boolean().optional().default(false) });
const confirmBodySchema = z.object({
  otp: z.string().min(1, "OTP is required")
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

  /**
   * POST /groups/:groupId/direct-debit-mandate
   * Creates mandate if needed (INACTIVE), then sends BVN OTP. Body: { resend?: boolean }.
   */
  async createAndAuthorizeMandate(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") });
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const { resend } = parseWithSchema(authorizeBodySchema, body);
    const userId = c.get("userId");
    const { mandate, authorize: auth } = await this.directDebitMandateService.createAndAuthorizeMandate(
      userId,
      params.groupId,
      resend
    );
    if (!auth.ok) {
      return c.json(
        { mandate, ok: false, message: auth.message, data: auth.data ?? null },
        400
      );
    }
    return c.json({
      mandate,
      ok: auth.ok,
      message: auth.message,
      data: auth.data ?? null
    });
  }

  /** POST /groups/:groupId/direct-debit-mandate/:mandateId/confirm - verify OTP, fetch accounts, create Mono mandates and save accounts. */
  async confirmMandate(c: Context): Promise<Response> {
    const mandateId = parseWithSchema(mandateIdParamSchema, { mandateId: c.req.param("mandateId") }).mandateId;
    const body = await c.req.json().catch(() => ({})) as unknown;
    const { otp } = parseWithSchema(confirmBodySchema, body);
    const userId = c.get("userId");
    const mandate = await this.directDebitMandateService.confirmWithOtp(mandateId, userId, otp);
    return c.json({ mandate: { id: mandate.id, groupId: mandate.groupId, status: mandate.status, createdAt: mandate.createdAt.toISOString() } });
  }

  /** POST .../accounts/:accountId — get or refresh Mono payment mandate (3h cache on reference). */
  async getOrRefreshAccountMandate(c: Context): Promise<Response> {
    const groupId = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") }).groupId;
    const accountId = parseWithSchema(accountIdParamSchema, { accountId: c.req.param("accountId") }).accountId;
    const userId = c.get("userId");
    const result = await this.directDebitMandateService.getOrRefreshAccountMandate(userId, groupId, accountId);
    return c.json(result);
  }

  /** POST .../accounts/:accountId/verify — poll Mono; activate account when approved. */
  async verifyAccountMandate(c: Context): Promise<Response> {
    const groupId = parseWithSchema(groupIdParamSchema, { groupId: c.req.param("groupId") }).groupId;
    const accountId = parseWithSchema(accountIdParamSchema, { accountId: c.req.param("accountId") }).accountId;
    const userId = c.get("userId");
    const result = await this.directDebitMandateService.verifyAccountMandate(userId, groupId, accountId);
    if (result.data === null) {
      return c.json({ message: result.message, data: null }, 400);
    }
    return c.json({ message: result.message, data: result.data });
  }
}
