import { sequelize } from "./config/database";
import { AuthController } from "./controllers/auth.controller";
import { KycController } from "./controllers/kyc.controller";
import { DashboardController } from "./controllers/dashboard.controller";
import { GroupController } from "./controllers/group.controller";
import { LoanController } from "./controllers/loan.controller";
import { RepaymentController } from "./controllers/repayment.controller";
import { DbDao } from "./dao/db.dao";
import { DirectDebitMandateDao } from "./dao/direct-debit-mandate.dao";
import { GroupInviteDao } from "./dao/group-invite.dao";
import { GroupMemberDao } from "./dao/group-member.dao";
import { GroupDao } from "./dao/group.dao";
import { LoanApprovalDao } from "./dao/loan-approval.dao";
import { LoanDao } from "./dao/loan.dao";
import { NotificationDao } from "./dao/notification.dao";
import { RepaymentDao } from "./dao/repayment.dao";
import { StatementDao } from "./dao/statement.dao";
import { UserDao } from "./dao/user.dao";
import { UserKycDataDao } from "./dao/user-kyc-data.dao";
import { UserKycOtpDao } from "./dao/user-kyc-otp.dao";
import { requireOnboardingComplete as requireOnboardingCompleteFactory } from "./middlewares/onboarding.middleware";
import { ApprovalService } from "./services/approval.service";
import { AuthService } from "./services/auth.service";
import { KycService } from "./services/kyc.service";
import { CreditService } from "./services/credit.service";
import { DashboardService } from "./services/dashboard.service";
import { GroupService } from "./services/group.service";
import { NotificationService } from "./services/notification.service";
import { LoanService } from "./services/loan.service";
import { QuarterlyService } from "./services/quarterly.service";
import { RepaymentService } from "./services/repayment.service";
import { TrustService } from "./services/trust.service";
import { DefaultService } from "./services/default.service";
import { EmailService } from "./email/email.service";

function createContainer() {
  const dbDao = new DbDao();
  const userDao = new UserDao();
  const userKycDataDao = new UserKycDataDao();
  const userKycOtpDao = new UserKycOtpDao();
  const statementDao = new StatementDao();
  const groupDao = new GroupDao();
  const groupMemberDao = new GroupMemberDao();
  const groupInviteDao = new GroupInviteDao();
  const loanDao = new LoanDao();
  const loanApprovalDao = new LoanApprovalDao();
  const repaymentDao = new RepaymentDao();
  const notificationDao = new NotificationDao();
  const directDebitMandateDao = new DirectDebitMandateDao();

  const creditService = new CreditService(groupMemberDao, userDao);
  const trustService = new TrustService(userDao, groupDao);
  const emailService = new EmailService();
  const notificationService = new NotificationService(notificationDao, userDao, emailService);
  const authService = new AuthService(
    userDao,
    creditService,
    groupMemberDao,
    groupInviteDao,
    groupDao,
    emailService
  );
  const loanService = new LoanService(
    dbDao,
    userDao,
    groupDao,
    groupMemberDao,
    loanDao,
    loanApprovalDao,
    repaymentDao,
    directDebitMandateDao,
    notificationService,
    emailService
  );
  const approvalService = new ApprovalService(
    dbDao,
    loanDao,
    loanApprovalDao,
    loanService,
    groupMemberDao,
    userDao,
    trustService,
    notificationService,
    emailService
  );
  const groupService = new GroupService(
    dbDao,
    groupDao,
    groupMemberDao,
    groupInviteDao,
    userDao,
    creditService,
    notificationService,
    emailService
  );
  const repaymentService = new RepaymentService(
    dbDao,
    loanDao,
    groupDao,
    repaymentDao,
    trustService
  );

  const dashboardService = new DashboardService(
    userDao,
    loanDao,
    loanApprovalDao,
    groupMemberDao,
    groupDao,
    statementDao,
    repaymentDao,
    notificationDao
  );

  const authController = new AuthController(authService);
  const kycService = new KycService(userDao, userKycDataDao, userKycOtpDao, statementDao);
  const kycController = new KycController(kycService);
  const dashboardController = new DashboardController(dashboardService);
  const loanController = new LoanController(loanService, approvalService, userDao);
  const groupController = new GroupController(groupService);
  const repaymentController = new RepaymentController(repaymentService);

  const requireOnboardingComplete = requireOnboardingCompleteFactory(userDao);
  const quarterlyService = new QuarterlyService(groupDao, loanDao, repaymentDao);
  const defaultService = new DefaultService(
    dbDao,
    loanDao,
    groupMemberDao,
    userDao,
    emailService
  );

  return {
    sequelize,
    emailService,
    authController,
    kycController,
    dashboardController,
    loanController,
    groupController,
    repaymentController,
    requireOnboardingComplete,
    directDebitMandateDao,
    runQuarterlyGroupReview: () => quarterlyService.runQuarterlyGroupReview(),
    defaultService
  };
}

export type Container = ReturnType<typeof createContainer>;
let containerInstance: Container | null = null;

export function getContainer(): Container {
  if (!containerInstance) containerInstance = createContainer();
  return containerInstance;
}

export function resetContainer(): void {
  containerInstance = null;
}
