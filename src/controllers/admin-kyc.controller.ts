import { Context } from "hono";
import { AdminKycService } from "../services/admin-kyc.service.js";
import { KycStatus } from "../models/enums.js";
import { parseWithSchema } from "../utils/request.js";
import { groupIdParamSchema } from "../validators/group.validator.js";

const VALID_USER_KYC_STATUSES = new Set<string>(Object.values(KycStatus));

/** Query `status` maps to users.kycStatus (User table). Omit to list all KYC records. */
function parseUserKycStatus(value: string | undefined): KycStatus | undefined {
  if (!value?.trim()) return undefined;
  const s = value.trim().toUpperCase();
  return VALID_USER_KYC_STATUSES.has(s) ? (s as KycStatus) : undefined;
}

export class AdminKycController {
  constructor(private readonly adminKycService: AdminKycService) {}

  async getKycCount(c: Context): Promise<Response> {
    const status = parseUserKycStatus(c.req.query("status"));
    const search = c.req.query("search")?.trim();
    const data = await this.adminKycService.getKycCount(status, search);
    return c.json(data);
  }

  async getKycList(c: Context): Promise<Response> {
    const status = parseUserKycStatus(c.req.query("status"));
    const search = c.req.query("search")?.trim();
    const limit = Math.min(Number(c.req.query("limit")) || 50, 100);
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);
    const data = await this.adminKycService.getKycList({ userKycStatus: status, search, limit, offset });
    return c.json(data);
  }

  async getKycDetails(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const data = await this.adminKycService.getKycDetails(kycId);
    return c.json(data);
  }

  async getGroupMembersKyc(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("groupId") });
    const data = await this.adminKycService.getGroupMembersKyc(id);
    return c.json(data);
  }

  async approveKyc(c: Context): Promise<Response> {
    const kycId = c.req.param("kycId");
    const body = await c.req.json().catch(() => ({})) as { creditLimit?: unknown };
    const raw = body.creditLimit;
    const creditLimit =
      raw === undefined
        ? undefined
        : typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim() !== ""
            ? Number(raw)
            : NaN;
    if (creditLimit !== undefined && Number.isNaN(creditLimit)) {
      return c.json({ error: "creditLimit must be a number" }, 400);
    }
    const data = await this.adminKycService.approveKyc(kycId, { creditLimit });
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
