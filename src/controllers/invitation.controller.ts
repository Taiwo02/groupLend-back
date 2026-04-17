import { Context } from "hono";
import { InvitationService } from "../services/invitation.service.js";
import { acceptInvitationSchema } from "../validators/auth.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";
import { z } from "../utils/request.js";

const tokenParamSchema = z.object({ token: z.string().trim().min(1, "Token is required") });

export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  async getInvitation(c: Context): Promise<Response> {
    const { token } = parseWithSchema(tokenParamSchema, { token: c.req.param("token") });
    const info = await this.invitationService.getByToken(token);
    return c.json(info);
  }

  async acceptInvitation(c: Context): Promise<Response> {
    const { token } = parseWithSchema(tokenParamSchema, { token: c.req.param("token") });
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(acceptInvitationSchema, body) as z.infer<typeof acceptInvitationSchema>;
    const userId = c.get("userId") as string | undefined;
    console.log("Token::", token);
    const result = await this.invitationService.accept(token, {
      userId,
      signup: payload.signup
    });
    return c.json(result);
  }

  async rejectInvitation(c: Context): Promise<Response> {
    const { token } = parseWithSchema(tokenParamSchema, { token: c.req.param("token") });
    const result = await this.invitationService.reject(token);
    return c.json(result);
  }
}
