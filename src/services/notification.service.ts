import { NotificationDao } from "../dao/notification.dao.js";
import { UserDao } from "../dao/user.dao.js";
import { EmailService } from "../email/email.service.js";
import { NotificationType } from "../models/enums.js";

export class NotificationService {
  constructor(
    private readonly notificationDao: NotificationDao,
    private readonly userDao?: UserDao,
    private readonly emailService?: EmailService
  ) {}

  async notify(
    userId: string,
    type: NotificationType,
    message: string
  ): Promise<void> {
    await this.notificationDao.create({ userId, type, message });
  }

  async notifyGroupInvite(userId: string, groupName: string): Promise<void> {
    await this.notify(
      userId,
      NotificationType.GROUP_INVITE,
      `You were invited to join group "${groupName}".`
    );
  }

  async notifyLoanRequest(userId: string, amount: number, borrowerName: string): Promise<void> {
    await this.notify(
      userId,
      NotificationType.LOAN_REQUEST,
      `Loan request of ${amount} from ${borrowerName} is pending your approval.`
    );
  }

  async notifyLoanApproval(userId: string, amount: number): Promise<void> {
    await this.notify(
      userId,
      NotificationType.LOAN_APPROVAL,
      `Your loan of ${amount} was approved.`
    );
  }

  async notifyLoanRejection(userId: string, amount: number): Promise<void> {
    await this.notify(
      userId,
      NotificationType.LOAN_REJECTION,
      `Your loan request of ${amount} was rejected.`
    );
  }

  async notifyRepaymentReminder(userId: string, amount: number, dueDate: string): Promise<void> {
    await this.notify(
      userId,
      NotificationType.REPAYMENT_REMINDER,
      `Reminder: repayment of ${amount} due on ${dueDate}.`
    );
    if (this.userDao && this.emailService) {
      const user = await this.userDao.findById(userId);
      if (user?.email) {
        this.emailService
          .sendRepaymentReminder(user.email, {
            borrowerName: user.fullName,
            amount,
            dueDate,
            currency: "NGN"
          })
          .catch(() => {});
      }
    }
  }

  async notifyDefaultAlert(userId: string, loanId: string): Promise<void> {
    await this.notify(
      userId,
      NotificationType.DEFAULT_ALERT,
      `Alert: loan ${loanId} is in default.`
    );
    if (this.userDao && this.emailService) {
      const user = await this.userDao.findById(userId);
      if (user?.email) {
        this.emailService
          .sendDefaultAlert(user.email, { borrowerName: user.fullName, loanId })
          .catch(() => {});
      }
    }
  }
}
