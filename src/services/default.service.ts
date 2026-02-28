import { DbDao } from "../dao/db.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { EmailService } from "../email/email.service.js";
import { GroupMemberStatus, LoanStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";

export type GroupLiability = {
  memberId: string;
  liabilityAmount: number;
};

export class DefaultService {
  constructor(
    private readonly dbDao: DbDao,
    private readonly loanDao: LoanDao,
    private readonly groupMemberDao: GroupMemberDao,
    private readonly userDao: UserDao,
    private readonly emailService: EmailService
  ) {}

  async handleDefaultedGroupLoan(loanId: string): Promise<GroupLiability[]> {
    return this.dbDao.withTransaction(async (transaction) => {
      const loan = await this.loanDao.findById(loanId, transaction);
      if (!loan || !loan.groupId) throw new HttpError(404, "Group loan not found");

      await loan.update({ status: LoanStatus.DEFAULTED }, { transaction });

      const activeMembers = await this.groupMemberDao.findActiveMembersByGroupId(loan.groupId, transaction);
      if (!activeMembers.length) throw new HttpError(400, "No active members for liability split");

      const perMember = toNumber(loan.outstandingBalance) / activeMembers.length;
      const liabilities: GroupLiability[] = activeMembers.map((member) => ({
        memberId: member.userId,
        liabilityAmount: Number(perMember.toFixed(2))
      }));

      // Liability trigger is represented by isolation of members for debt recovery workflow.
      for (const member of activeMembers) {
        await member.update({ status: GroupMemberStatus.ISOLATED }, { transaction });
      }

      const borrower = await this.userDao.findById(loan.borrowerId, transaction);
      if (borrower?.email) {
        this.emailService
          .sendDefaultAlert(borrower.email, {
            borrowerName: borrower.fullName,
            loanId: loan.id
          })
          .catch(() => {});
      }
      return liabilities;
    });
  }
}
