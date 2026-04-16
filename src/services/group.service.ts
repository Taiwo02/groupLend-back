import { randomBytes, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { Transaction } from "sequelize";
import { DbDao } from "../dao/db.dao.js";
import { GroupDao } from "../dao/group.dao.js";
import { GroupInviteDao } from "../dao/group-invite.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { Group, GroupInvite, GroupMember } from "../models/index.js";
import { GroupMemberRole, GroupMemberStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { EmailService } from "../email/email.service.js";
import { CreditService } from "./credit.service.js";
import { NotificationService } from "./notification.service.js";

export type InviteeInput = { fullName: string; email: string; phone?: string };

export type CreateGroupInput = {
  creatorId: string;
  name: string;
  description: string;
  states: string[];
  expectedLoan: number;
  targetCredit?: number;
  minimumAmount?: number | null;
  maximumAmount?: number | null;
  repaymentPeriod?: number | null;
  repaymentType?: string | null;
  interestType?: string | null;
  interest?: number | null;
  penalCharges?: number | null;
  gracePeriod?: number | null;
  gracePeriodType?: string | null;
  overGracePenalCharges?: number | null;
  ageRange?: string[];
  status?: string;
  members?: InviteeInput[];
};

export class GroupService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly groupDao: GroupDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly groupInviteDao: GroupInviteDao,
    private readonly userDao: UserDao,
    private readonly creditService: CreditService,
    private readonly notificationService: NotificationService,
    private readonly emailService: EmailService
  ) {}

  /** 12-char hex token for member-invitation links. */
  private generateInvitationToken(): string {
    return randomBytes(6).toString("hex");
  }

  async createGroup(input: CreateGroupInput): Promise<Group> {
    const baseUrl = env.frontendUrl.replace(/\/$/, "") || "";
    const result = await this.dbDao.withTransaction<{
      group: Group;
      inviteEmails: Array<{ email: string; recipientName: string; existingUserId?: string; invitationToken: string }>;
    }>(async (transaction: Transaction) => {
      const groupId = randomUUID();
      const group = await this.groupDao.createGroup(
        {
          name: input.name,
          targetCredit: input.targetCredit ?? 0,
          createdBy: input.creatorId,
          currentCreditPool: 0,
          credibilityScore: 0,
          groupId,
          minimumAmount: input.minimumAmount ?? null,
          maximumAmount: input.maximumAmount ?? null,
          repaymentPeriod: input.repaymentPeriod ?? null,
          repaymentType: input.repaymentType ?? null,
          description: input.description,
          interestType: input.interestType ?? null,
          interest: input.interest ?? null,
          penalCharges: input.penalCharges ?? null,
          gracePeriod: input.gracePeriod ?? null,
          gracePeriodType: input.gracePeriodType ?? null,
          overGracePenalCharges: input.overGracePenalCharges ?? null,
          ageRange: input.ageRange,
          states: input.states,
          expectedLoan: input.expectedLoan,
          status: input.status
        },
        transaction
      );

      await this.groupMemberDao.createMember(
        {
          groupId: group.id,
          userId: input.creatorId,
          role: GroupMemberRole.CREATOR,
          status: GroupMemberStatus.ACTIVE
        },
        transaction
      );

      await this.creditService.applyComputedGroupCredit(group.id, transaction);

      const now = new Date();
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
      await this.groupDao.updateQuarterAndPool(
        group.id,
        { quarterlyStartDate: qStart, quarterlyEndDate: qEnd },
        transaction
      );

      const inviteEmails: Array<{ email: string; recipientName: string; existingUserId?: string; invitationToken: string }> = [];
      const members = input.members ?? [];
      for (const inv of members) {
        const email = inv.email.toLowerCase().trim();
        const existingUser = await this.userDao.findByEmail(email);
        const invitationToken = this.generateInvitationToken();

        if (existingUser) {
          const activeGroupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(existingUser.id, transaction);
          if (activeGroupIds.length > 0) {
            throw new HttpError(400, "This person already belongs to a group");
          }
          const existingMember = await this.groupMemberDao.findByGroupAndUser(group.id, existingUser.id, transaction);
          if (existingMember) {
            throw new HttpError(400, "This person is already a member or has been invited to this group");
          }
          await this.groupMemberDao.findOrCreateInvitedMember(group.id, existingUser.id, transaction, invitationToken);
          inviteEmails.push({ email, recipientName: existingUser.fullName, existingUserId: existingUser.id, invitationToken });
        } else {
          await this.groupInviteDao.create(
            {
              groupId: group.id,
              email,
              fullName: inv.fullName.trim(),
              phone: inv.phone?.trim() ?? null,
              invitedBy: input.creatorId,
              invitationToken
            },
            transaction
          );
          inviteEmails.push({ email, recipientName: inv.fullName.trim(), invitationToken });
        }
      }

      return { group, inviteEmails };
    });

    const inviter = await this.userDao.findById(input.creatorId);
    for (const { email, recipientName, invitationToken } of result.inviteEmails) {
      const acceptUrl = baseUrl ? `${baseUrl}/member-invitation/${invitationToken}` : "#";
      this.emailService
        .sendGroupInvite(email, {
          recipientName,
          groupName: result.group.name,
          inviterName: inviter?.fullName,
          acceptUrl,
          baseUrl: env.frontendUrl
        })
        .catch(() => {});
    }
    for (const { existingUserId } of result.inviteEmails) {
      if (existingUserId) {
        this.notificationService.notifyGroupInvite(existingUserId, result.group.name).catch(() => {});
      }
    }
    return result.group;
  }

  /**
   * Invite by full details (fullName, email, phone). Sends invitation email.
   * - If invitee is already registered: do not add to user table; use their existing id and create group_member (INVITED).
   * - If invitee is not registered: create group_invite (pending); when they sign up, they are added to the group.
   * One user can belong to one group at a time.
   */
  async inviteMembers(
    groupId: string,
    invites: InviteeInput[],
    callerId: string
  ): Promise<Array<GroupInvite | GroupMember>> {
    const group = await this.groupDao.findById(groupId);
    if (!group) throw new HttpError(404, "Group not found");
    if (group.createdBy !== callerId) {
      throw new HttpError(403, "Only the group creator can invite members");
    }

    const inviter = await this.userDao.findById(callerId);
    const baseUrl = env.frontendUrl.replace(/\/$/, "") || "";
    return this.dbDao.withTransaction(async (transaction) => {
      const result: Array<GroupInvite | GroupMember> = [];
      for (const inv of invites) {
        const email = inv.email.toLowerCase().trim();
        const existingUser = await this.userDao.findByEmail(email);
        const invitationToken = this.generateInvitationToken();

        if (existingUser) {
          const activeGroupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(existingUser.id, transaction);
          if (activeGroupIds.length > 0) {
            throw new HttpError(400, "This person already belongs to a group");
          }
          const existingMember = await this.groupMemberDao.findByGroupAndUser(groupId, existingUser.id, transaction);
          if (existingMember) {
            throw new HttpError(400, "This person is already a member or has been invited to this group");
          }
          const [member] = await this.groupMemberDao.findOrCreateInvitedMember(
            groupId,
            existingUser.id,
            transaction,
            invitationToken
          );
          result.push(member);
          const acceptUrl = baseUrl ? `${baseUrl}/member-invitation/${invitationToken}` : "#";
          this.emailService
            .sendGroupInvite(email, {
              recipientName: existingUser.fullName,
              groupName: group.name,
              inviterName: inviter?.fullName,
              acceptUrl,
              baseUrl: env.frontendUrl
            })
            .catch(() => {});
          this.notificationService.notifyGroupInvite(existingUser.id, group.name).catch(() => {});
        } else {
          const groupInvite = await this.groupInviteDao.create(
            {
              groupId,
              email,
              fullName: inv.fullName.trim(),
              phone: inv.phone?.trim() ?? null,
              invitedBy: callerId,
              invitationToken
            },
            transaction
          );
          result.push(groupInvite);
          const acceptUrl = baseUrl ? `${baseUrl}/member-invitation/${invitationToken}` : "#";
          this.emailService
            .sendGroupInvite(email, {
              recipientName: inv.fullName.trim(),
              groupName: group.name,
              inviterName: inviter?.fullName,
              acceptUrl,
              baseUrl: env.frontendUrl
            })
            .catch(() => {});
        }
      }
      return result;
    });
  }

  async joinGroup(groupId: string, userId: string): Promise<GroupMember> {
    return this.dbDao.withTransaction(async (transaction) => {
      const existingGroupIds = await this.groupMemberDao.findActiveGroupIdsByUserId(userId, transaction);
      if (existingGroupIds.length > 0 && !existingGroupIds.includes(groupId)) {
        throw new HttpError(400, "You already belong to a group");
      }
      const member = await this.groupMemberDao.findByGroupAndUser(groupId, userId, transaction);
      if (!member) throw new HttpError(404, "No invitation found");

      await member.update({ status: GroupMemberStatus.ACTIVE }, { transaction });
      await this.computeGroupCreditPool(groupId, transaction);
      return member;
    });
  }

  async computeGroupCreditPool(groupId: string, transaction?: Transaction): Promise<number> {
    return this.creditService.applyComputedGroupCredit(groupId, transaction);
  }

  async getGroup(groupId: string, userId: string): Promise<Group> {
    const group = await this.groupDao.getGroupWithRelations(groupId);
    if (!group) throw new HttpError(404, "Group not found");

    const member = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!member) throw new HttpError(403, "You are not a member of this group");

    return group;
  }

  /** Request exit: set status to ISOLATED. Member cannot request/approve loans or exit permanently until loans repaid. */
  async requestExit(groupId: string, userId: string): Promise<GroupMember> {
    const member = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!member) throw new HttpError(404, "Not a member of this group");
    if (member.status === GroupMemberStatus.EXITED) throw new HttpError(400, "Already exited");
    if (member.status === GroupMemberStatus.ISOLATED) throw new HttpError(400, "Exit already requested");

    await member.update({ status: GroupMemberStatus.ISOLATED });
    return member;
  }

  /** Permanent exit only when all group loans (during active period) are fully repaid. Recomputes group credit pool. */
  async finalExit(groupId: string, userId: string): Promise<GroupMember> {
    const member = await this.groupMemberDao.findByGroupAndUser(groupId, userId);
    if (!member) throw new HttpError(404, "Not a member of this group");
    if (member.status === GroupMemberStatus.EXITED) throw new HttpError(400, "Already exited");

    const hasUnrepaidGroupLoans = await this.groupDao.hasUnrepaidGroupLoans(groupId);
    if (hasUnrepaidGroupLoans) {
      throw new HttpError(
        400,
        "Cannot exit permanently until all group loans are fully repaid"
      );
    }

    return this.dbDao.withTransaction(async (transaction) => {
      await member.update({ status: GroupMemberStatus.EXITED }, { transaction });
      await this.computeGroupCreditPool(groupId, transaction);
      const updated = await this.groupMemberDao.findByGroupAndUser(groupId, userId, transaction);
      if (!updated) throw new HttpError(500, "Member not found");
      return updated;
    });
  }
}
