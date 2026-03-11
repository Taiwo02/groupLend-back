import { Context } from "hono";
import { AdminKycService } from "../services/admin-kyc.service.js";
import { KycStatus } from "../models/enums.js";

const VALID_STATUSES = new Set<KycStatus>([
  KycStatus.PENDING,
  KycStatus.SUBMITTED,
  KycStatus.RESUBMITTED
]);

function parseStatus(value: string | undefined): KycStatus | undefined {
  if (!value?.trim()) return undefined;
  const s = value.toUpperCase() as KycStatus;
  return VALID_STATUSES.has(s) ? s : undefined;
}

export class AdminKycController {
  constructor(private readonly adminKycService: AdminKycService) {}

  async getKycCount(c: Context): Promise<Response> {
    const status = parseStatus(c.req.query("status"));
    const search = c.req.query("search")?.trim();
    const data = await this.adminKycService.getKycCount(status, search);
    return c.json(data);
  }

  async getKycList(c: Context): Promise<Response> {
    const status = parseStatus(c.req.query("status"));
    const search = c.req.query("search")?.trim();
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);
    const data = await this.adminKycService.getKycList({ status, search, limit, offset });
    return c.json(data);
  }
}
