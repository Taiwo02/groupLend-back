import { Context } from "hono";
import { NinService } from "../services/nin.service.js";
import { ninLookupSchema, ninVerifySchema } from "../validators/nin.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

export class NinController {
  constructor(private readonly ninService: NinService) {}

  async lookup(c: Context): Promise<Response> {
    const userId = c.get("userId");
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(ninLookupSchema, body);
    const result = await this.ninService.lookup(userId, payload);
    return c.json(result);
  }

  async verify(c: Context): Promise<Response> {
    const userId = c.get("userId");
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(ninVerifySchema, body);
    const result = await this.ninService.verify(userId, payload);
    return c.json(result);
  }
}
