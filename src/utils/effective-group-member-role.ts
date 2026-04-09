import { GroupMemberRole } from "../models/enums.js";

/**
 * The group lead is always `groups.createdBy`. `group_members.role` can disagree
 * (e.g. invite auto-join always stores MEMBER). APIs should use this so the lead
 * is never shown or authorized as a plain member.
 */
export function effectiveGroupMemberRole(
  groupCreatedBy: string,
  memberUserId: string,
  storedRole: GroupMemberRole
): GroupMemberRole {
  if (memberUserId === groupCreatedBy) {
    return GroupMemberRole.CREATOR;
  }
  if (storedRole === GroupMemberRole.CREATOR) {
    return GroupMemberRole.MEMBER;
  }
  return storedRole;
}
