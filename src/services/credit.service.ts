import { GroupMemberDao } from "../dao/group-member.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { toNumber } from "../utils/number.js";

export class CreditService {
  constructor(
    private readonly groupMemberDao: GroupMemberDao,
    private readonly userDao: UserDao
  ) {}

  calculateIndividualCreditLimit(monthlyIncome: number): number {
    return monthlyIncome * 3;
  }

  async calculateGroupCreditLimit(groupId: string): Promise<number> {
    const activeMembers = await this.groupMemberDao.findActiveMemberUserIds(groupId);

    if (!activeMembers.length) return 0;

    const userIds = activeMembers.map((member) => member.userId);
    const members = await this.userDao.findByIds(userIds);

    return members.reduce((sum, member) => sum + toNumber(member.monthlyIncome) * 2, 0);
  }
}
