import { Context } from "hono";
import { AdminKycService } from "../services/admin-kyc.service.js";
import type { KycRecordStatus } from "../models/user-kyc-data.model.js";

const VALID_STATUSES = new Set<KycRecordStatus>(["PENDING", "SUBMITTED", "RESUBMITTED"]);

function parseStatus(value: string | undefined): KycRecordStatus | undefined {
  if (!value?.trim()) return undefined;
  const s = value.toUpperCase() as KycRecordStatus;
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

  async getKycDetails(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.getKycDetails(kycId);
    return c.json(data);
  }

  async approveKyc(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.approveKyc(kycId);
    return c.json(data);
  }

  async rejectKyc(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const body = await c.req.json().catch(() => ({})) as { comment?: string };
    const data = await this.adminKycService.rejectKyc(kycId, body.comment);
    return c.json(data);
  }

  async verifyAddress(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.verifyAddress(kycId);
    return c.json(data);
  }

  async verifyCreditHistory(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.verifyCreditHistory(kycId);
    return c.json(data);
  }

  async fetchStatement(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.fetchStatement(kycId);
    return c.json(data);
  }

  async verifyNin(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.verifyNin(kycId);
    return c.json(data);
  }
}
