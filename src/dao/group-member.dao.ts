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
    transaction: Transaction
  ): Promise<[GroupMember, boolean]> {
    return GroupMember.findOrCreate({
      where: { groupId, userId },
      defaults: {
        groupId,
        userId,
        role: GroupMemberRole.MEMBER,
        status: GroupMemberStatus.INVITED
      },
      transaction
    });
  }

  findActiveMemberUserIds(groupId: string): Promise<GroupMember[]> {
    return GroupMember.findAll({
      where: { groupId, status: GroupMemberStatus.ACTIVE },
      attributes: ["userId"]
    });
  }

  findActiveGroupIdsByUserId(userId: string, transaction?: Transaction): Promise<string[]> {
    return GroupMember.findAll({
      where: { userId, status: GroupMemberStatus.ACTIVE },
      attributes: ["groupId"],
      transaction
    }).then((rows) => rows.map((r) => r.groupId));
  }
}
