import { Context } from "hono";
import { AdminGroupsService } from "../services/admin-groups.service.js";
import { GroupStatus } from "../models/enums.js";
import {
  adminCreateGroupBodySchema,
  adminGroupActivityQuerySchema,
  adminGroupExportQuerySchema,
  adminGroupListQuerySchema,
  adminGroupMembersQuerySchema,
  adminPatchGroupBodySchema
} from "../validators/admin-directory.validator.js";
import { groupIdParamSchema } from "../validators/group.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";
import { toNumber } from "../utils/number.js";

export class AdminGroupsController {
  constructor(private readonly adminGroupsService: AdminGroupsService) {}

  async getSummary(c: Context): Promise<Response> {
    const data = await this.adminGroupsService.getSummary();
    return c.json(data);
  }

  async listGroups(c: Context): Promise<Response> {
    const q = parseWithSchema(adminGroupListQuerySchema, {
      q: c.req.query("q"),
      onboardingStatus: c.req.query("onboardingStatus"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset")
    });
    const limit = q.limit ?? 10;
    const offset = q.offset ?? 0;
    const { groups, total } = await this.adminGroupsService.listGroups({
      q: q.q,
      onboardingStatus: q.onboardingStatus,
      limit,
      offset
    });
    const items = groups.map((g) => ({
      ...g,
      maximumAmount: g.maximumAmount != null ? toNumber(g.maximumAmount) : null,
      targetCredit: toNumber(g.targetCredit),
      createdAt: g.createdAt.toISOString()
    }));
    return c.json({ groups: items, total, limit, offset });
  }

  async exportGroups(c: Context): Promise<Response> {
    const q = parseWithSchema(adminGroupExportQuerySchema, {
      q: c.req.query("q"),
      onboardingStatus: c.req.query("onboardingStatus"),
      limit: c.req.query("limit")
    });
    const limit = q.limit ?? 5000;
    const { groups, total } = await this.adminGroupsService.listGroups({
      q: q.q,
      onboardingStatus: q.onboardingStatus,
      limit,
      offset: 0
    });
    const items = groups.map((g) => ({
      ...g,
      maximumAmount: g.maximumAmount != null ? toNumber(g.maximumAmount) : null,
      targetCredit: toNumber(g.targetCredit),
      createdAt: g.createdAt.toISOString()
    }));
    c.header("Content-Disposition", 'attachment; filename="credit-groups.json"');
    return c.json({ groups: items, exported: items.length, totalMatched: total });
  }

  async getGroup(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const detail = await this.adminGroupsService.getGroupDetail(id);
    return c.json(detail);
  }

  async listGroupMembers(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const q = parseWithSchema(adminGroupMembersQuerySchema, {
      q: c.req.query("q"),
      limit: c.req.query("limit"),
      offset: c.req.query("offset")
    });
    const limit = q.limit ?? 20;
    const offset = q.offset ?? 0;
    const { members, total } = await this.adminGroupsService.listGroupMembers(id, {
      q: q.q,
      limit,
      offset
    });
    return c.json({ members, total, limit, offset });
  }

  async getGroupActivity(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const q = parseWithSchema(adminGroupActivityQuerySchema, {
      limit: c.req.query("limit")
    });
    const limit = q.limit ?? 20;
    const items = await this.adminGroupsService.getGroupActivity(id, limit);
    return c.json({ activity: items, limit });
  }

  async getGroupCertificate(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const payload = this.adminGroupsService.getEligibilityCertificateStub(id);
    return c.json(payload);
  }

  async patchGroup(c: Context): Promise<Response> {
    const { id } = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const body = await readJsonBody<Record<string, unknown>>(c);
    const patch = parseWithSchema(adminPatchGroupBodySchema, body);
    const updated = await this.adminGroupsService.patchGroup(id, {
      ...patch,
      status: patch.status as GroupStatus | undefined,
      currentCreditPool: patch.currentCreditPool,
      creditFrozen: patch.creditFrozen
    });
    return c.json({ group: updated });
  }

  async createGroup(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(adminCreateGroupBodySchema, body);
    const { createdByUserId, ...rest } = payload;
    const group = await this.adminGroupsService.createGroupAsAdmin({
      creatorId: createdByUserId,
      ...rest
    });
    return c.json({ group }, 201);
  }
}
