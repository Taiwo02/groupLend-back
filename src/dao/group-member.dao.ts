import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { GroupMember } from "../models/index.js";
import { GroupMemberRole, GroupMemberStatus } from "../models/enums.js";

export class GroupMemberDao {
  createMember(
    payload: {
      groupId: string;
      userId: string;
      role: GroupMemberRole;
      status: GroupMemberStatus;
    },
    transaction?: Transaction
  ): Promise<GroupMember> {
    return GroupMember.create(payload, { transaction: transaction ?? undefined });
  }

  findActiveMembersByGroupId(groupId: string, transaction?: Transaction): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.ACTIVE },
      transaction
    });
  }

  /** All members in group (ACTIVE or INVITED) for onboarding view. */
  findMembersByGroupId(groupId: string, transaction?: Transaction): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: { [Op.in]: [GroupMemberStatus.ACTIVE, GroupMemberStatus.INVITED] } },
      transaction
    });
  }

  findByGroupAndUser(groupId: string, userId: string, transaction?: Transaction): Promise<GroupMember | null> {
    return GroupMember.findOne({ where: { groupId, userId }, transaction });
  }

  findOrCreateInvitedMember(
    groupId: string,
    userId: string,
    transaction: Transaction,
    invitationToken?: string | null
  ): Promise<[GroupMember, boolean]> {
    return GroupMember.findOrCreate({
      where: { groupId, userId },
      defaults: {
        groupId,
        userId,
        role: GroupMemberRole.MEMBER,
        status: GroupMemberStatus.INVITED,
        invitationToken: invitationToken ?? null
      },
      transaction
    }).then(async ([member, created]) => {
      if (!created && invitationToken != null) {
        await member.update({ invitationToken }, { transaction });
      }
      return [member, created];
    });
  }

  findByInvitationToken(token: string, transaction?: Transaction): Promise<GroupMember | null> {
    return GroupMember.findOne({
      where: { invitationToken: token, status: GroupMemberStatus.INVITED },
      transaction
    });
  }

  async updateMemberStatus(
    groupId: string,
    userId: string,
    status: GroupMemberStatus,
    transaction?: Transaction
  ): Promise<void> {
    await GroupMember.update({ status }, { where: { groupId, userId }, transaction });
  }

  async updateMemberRole(
    groupId: string,
    userId: string,
    role: GroupMemberRole,
    transaction?: Transaction
  ): Promise<void> {
    await GroupMember.update({ role }, { where: { groupId, userId }, transaction });
  }

  async deleteByGroupAndUser(groupId: string, userId: string, transaction?: Transaction): Promise<number> {
    const result = await GroupMember.destroy({ where: { groupId, userId }, transaction });
    return result;
  }

  async clearInvitationToken(token: string, transaction?: Transaction): Promise<void> {
    await GroupMember.update({ invitationToken: null }, { where: { invitationToken: token }, transaction });
  }

  findActiveMemberUserIds(groupId: string, transaction?: Transaction): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.ACTIVE },
      attributes: ["userId"],
      transaction
    });
  }

  findActiveGroupIdsByUserId(userId: string, transaction?: Transaction): Promise<string[]> {
    return GroupMember.findAll({
      where: { userId, status: GroupMemberStatus.ACTIVE },
      attributes: ["groupId"],
      transaction
    }).then((rows) => rows.map((r) => r.groupId));
  }

  async countActiveMembersByGroupIds(
    groupIds: string[],
    transaction?: Transaction
  ): Promise<Map<string, number>> {
    if (groupIds.length === 0) return new Map();
    const rows = await GroupMember.findAll({
      where: { groupId: { [Op.in]: groupIds }, status: GroupMemberStatus.ACTIVE },
      attributes: ["groupId"]
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.groupId, (counts.get(row.groupId) ?? 0) + 1);
    }
    return counts;
  }

  /** Members who have not yet accepted (status INVITED). */
  findInvitedMembersByGroupId(groupId: string, transaction?: Transaction): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.INVITED },
      transaction
    });
  }

  /**
   * Members who have been added to the group but not yet accepted (same basis as onboarding: {@link findMembersByGroupId} INVITED slice).
   * Do not require `invitationToken`: legacy rows and some flows can be INVITED with a null token.
   */
  findPendingInvitedMembersByGroupId(groupId: string, transaction?: Transaction): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.INVITED },
      transaction
    });
  }
}
