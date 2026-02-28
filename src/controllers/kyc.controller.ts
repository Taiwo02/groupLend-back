import { Context } from "hono";
import { KycService } from "../services/kyc.service.js";
import {
  kycSubmitStepSchema,
  kycGoBackSchema
} from "../validators/kyc.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

export class KycController {
  constructor(private readonly kycService: KycService) {}

  async getStatus(c: Context): Promise<Response> {
    const userId = c.get("userId");
    const status = await this.kycService.getStatus(userId);
    return c.json(status);
  }

  async submitStep(c: Context): Promise<Response> {
    const userId = c.get("userId");
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(kycSubmitStepSchema, body);
    const result = await this.kycService.submitStep(userId, payload);
    return c.json(result);
  }

  async goBack(c: Context): Promise<Response> {
    const userId = c.get("userId");
    const body = await readJsonBody<Record<string, unknown>>(c);
    const { toStep } = parseWithSchema(kycGoBackSchema, body);
    const result = await this.kycService.goBack(userId, toStep);
    return c.json(result);
  }
}
