import { Context } from "hono";
import { AdminUsersService } from "../services/admin-users.service.js";
import { CreditStatus, KycStatus } from "../models/enums.js";
import { adminUserListQuerySchema } from "../validators/admin-directory.validator.js";
import { parseWithSchema, z } from "../utils/request.js";

const userIdParamSchema = z.object({ id: z.uuid("user id must be a valid uuid") });

export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  async getSummary(c: Context): Promise<Response> {
    const data = await this.adminUsersService.getSummary();
    return c.json(data);
  }

  async listUsers(c: Context): Promise<Response> {
    const q = parseWithSchema(adminUserListQuerySchema, {
      q: c.req.query("q"),
      kycStatus: c.req.query("kycStatus"),
      creditStatus: c.req.query("creditStatus"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset")
    });
    const limit = q.limit ?? 10;
    const offset = q.offset ?? 0;
    const { users, total } = await this.adminUsersService.listUsers({
      q: q.q,
      kycStatus: q.kycStatus as KycStatus | undefined,
      creditStatus: q.creditStatus as CreditStatus | undefined,
      limit,
      offset
    });
    return c.json({ users, total, limit, offset });
  }

  async getUser(c: Context): Promise<Response> {
    const { id } = parseWithSchema(userIdParamSchema, { id: c.req.param("id") });
    const user = await this.adminUsersService.getUserDetail(id);
    return c.json({ user });
  }
}
