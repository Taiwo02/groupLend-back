import { Context } from "hono";
import { GroupService } from "../services/group.service.js";
import {
  createGroupSchema,
  groupIdParamSchema,
  inviteMembersSchema
} from "../validators/group.validator.js";
import { parseWithSchema, readJsonBody } from "../utils/request.js";

export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  async createGroup(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const payload = parseWithSchema(createGroupSchema, body);
    const group = await this.groupService.createGroup({
      creatorId: c.get("userId"),
      name: payload.name,
      description: payload.description,
      states: payload.states,
      expectedLoan: payload.expectedLoan,
      targetCredit: payload.targetCredit ?? 0,
      minimumAmount: payload.minimumAmount,
      maximumAmount: payload.maximumAmount,
      repaymentPeriod: payload.repaymentPeriod,
      repaymentType: payload.repaymentType,
      interestType: payload.interestType,
      interest: payload.interest,
      penalCharges: payload.penalCharges,
      gracePeriod: payload.gracePeriod,
      gracePeriodType: payload.gracePeriodType,
      overGracePenalCharges: payload.overGracePenalCharges,
      ageRange: payload.ageRange,
      status: payload.status,
      members: payload.members
    });
    return c.json(group, 201);
  }

  async inviteMembers(c: Context): Promise<Response> {
    const body = await readJsonBody<Record<string, unknown>>(c);
    const params = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const payload = parseWithSchema(inviteMembersSchema, body);

    const invited = await this.groupService.inviteMembers(
      params.id,
      payload.invites,
      c.get("userId")
    );
    return c.json(invited);
  }

  async getGroup(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const group = await this.groupService.getGroup(params.id, c.get("userId"));
    return c.json(group);
  }

  async requestExit(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const member = await this.groupService.requestExit(params.id, c.get("userId"));
    return c.json(member);
  }

  async finalExit(c: Context): Promise<Response> {
    const params = parseWithSchema(groupIdParamSchema, { id: c.req.param("id") });
    const member = await this.groupService.finalExit(params.id, c.get("userId"));
    return c.json(member);
  }
}
