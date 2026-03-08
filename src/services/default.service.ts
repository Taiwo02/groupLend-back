import { Transaction } from "sequelize";
import { AccountDao } from "../dao/account.dao.js";
import { DbDao } from "../dao/db.dao.js";
import { GroupMemberDao } from "../dao/group-member.dao.js";
import { LoanDao } from "../dao/loan.dao.js";
import { MemberMandateDao } from "../dao/member-mandate.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { EmailService } from "../email/email.service.js";
import { GroupMemberStatus, LoanStatus } from "../models/enums.js";
import { HttpError } from "../utils/http-error.js";
import { toNumber } from "../utils/number.js";
import { NotificationService } from "./notification.service.js";

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
    private readonly accountDao: AccountDao,
    private readonly memberMandateDao: MemberMandateDao,
    private readonly notificationService: NotificationService,
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
      const borrowerName = borrower?.fullName ?? "A member";
      if (borrower?.email) {
        this.emailService
          .sendDefaultAlert(borrower.email, {
            borrowerName: borrower.fullName,
            loanId: loan.id
          })
          .catch(() => {});
      }

      this.notificationService.notifyDefaultAlert(loan.borrowerId, loan.id).catch(() => {});

      if (loan.mandateId) {
        const outstanding = Number(toNumber(loan.outstandingBalance).toFixed(2));
        const activeAccounts = await this.accountDao.findActiveByMandateId(
          loan.mandateId,
          transaction
        );
        const memberMandates = await this.memberMandateDao.findAllByMandateId(
          loan.mandateId,
          transaction
        );
        const memberMandateIdToUserId = new Map(
          memberMandates.map((m) => [m.id, m.userId])
        );
        for (const account of activeAccounts) {
          if (!account.memberMandateId) continue;
          const accountUserId = memberMandateIdToUserId.get(account.memberMandateId);
          if (!accountUserId || accountUserId === loan.borrowerId) continue;
          await this.attemptRecoveryDebit(account.id, outstanding, transaction);
          this.notificationService
            .notifyRecoveryDebit(accountUserId, outstanding, borrowerName)
            .catch(() => {});
          const debitedUser = await this.userDao.findById(accountUserId, transaction);
          if (debitedUser?.email && "sendRecoveryDebitAlert" in this.emailService) {
            (this.emailService as { sendRecoveryDebitAlert: (email: string, vars: unknown) => Promise<unknown> })
              .sendRecoveryDebitAlert(debitedUser.email, {
                debitedUserName: debitedUser.fullName,
                amount: outstanding,
                defaulterName: borrowerName
              })
              .catch(() => {});
          }
          break;
        }
      }

      return liabilities;
    });
  }

  /**
   * Attempt to debit the given account for the outstanding amount (e.g. via Mono direct debit).
   * Placeholder: in production this would call the payment provider.
   */
  private async attemptRecoveryDebit(
    _accountId: string,
    _amount: number,
    _transaction: Transaction
  ): Promise<void> {
    // TODO: integrate with Mono (or other provider) to perform direct debit on account
  }
}
