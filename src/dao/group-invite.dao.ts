import { Op } from "sequelize";
import { Transaction } from "sequelize";
import { GroupInvite } from "../models/group-invite.model.js";

export class GroupInviteDao {
  async create(
    payload: {
      groupId: string;
      email: string;
      fullName: string;
      phone: string | null;
      invitedBy: string;
      invitationToken?: string | null;
    },
    transaction?: Transaction
  ): Promise<GroupInvite> {
    return GroupInvite.create(
      { ...payload, status: "pending" },
      { transaction: transaction ?? undefined }
    );
  }

  findByInvitationToken(token: string, transaction?: Transaction): Promise<GroupInvite | null> {
    return GroupInvite.findOne({
      where: { invitationToken: token, status: "pending" },
      transaction
    });
  }

  findByIdAndGroup(inviteId: string, groupId: string, transaction?: Transaction): Promise<GroupInvite | null> {
    return GroupInvite.findOne({
      where: { id: inviteId, groupId },
      transaction
    });
  }

  async findPendingByEmail(email: string, transaction?: Transaction): Promise<GroupInvite[]> {
    return GroupInvite.findAll({
      where: { email: email.toLowerCase(), status: "pending" },
      order: [["createdAt", "DESC"]],
      transaction
    });
  }

  /** Pending email invites for dashboard / admin views (not yet signed up). */
  findPendingByGroupIds(groupIds: string[], transaction?: Transaction): Promise<GroupInvite[]> {
    if (groupIds.length === 0) return Promise.resolve([]);
    return GroupInvite.findAll({
      where: { groupId: { [Op.in]: groupIds }, status: "pending" },
      order: [["createdAt", "ASC"]],
      transaction
    });
  }

  async markAccepted(id: string, transaction?: Transaction): Promise<void> {
    await GroupInvite.update({ status: "accepted" }, { where: { id }, transaction });
  }

  async markExpiredForEmail(email: string, exceptInviteId: string, transaction?: Transaction): Promise<void> {
    await GroupInvite.update(
      { status: "expired" },
      { where: { email: email.toLowerCase(), status: "pending", id: { [Op.ne]: exceptInviteId } }, transaction }
    );
  }

  async markExpired(id: string, transaction?: Transaction): Promise<void> {
    await GroupInvite.update({ status: "expired" }, { where: { id }, transaction });
  }
}
