import { sequelize } from "./config/database.js";
import { AuthController } from "./controllers/auth.controller.js";
import { InvitationController } from "./controllers/invitation.controller.js";
import { KycController } from "./controllers/kyc.controller.js";
import { LookupController } from "./controllers/lookup.controller.js";
import { NinController } from "./controllers/nin.controller.js";
import { DashboardController } from "./controllers/dashboard.controller.js";
import { AdminDashboardController } from "./controllers/admin-dashboard.controller.js";
import { AdminKycController } from "./controllers/admin-kyc.controller.js";
import { GroupController } from "./controllers/group.controller.js";
import { LoanController } from "./controllers/loan.controller.js";
import { RepaymentController } from "./controllers/repayment.controller.js";
import { DbDao } from "./dao/db.dao.js";
import { DirectDebitMandateDao } from "./dao/direct-debit-mandate.dao.js";
import { GroupInviteDao } from "./dao/group-invite.dao.js";
import { GroupMemberDao } from "./dao/group-member.dao.js";
import { GroupDao } from "./dao/group.dao.js";
import { LoanApprovalDao } from "./dao/loan-approval.dao.js";
import { LoanDao } from "./dao/loan.dao.js";
import { MandateDao } from "./dao/mandate.dao.js";
import { MemberMandateDao } from "./dao/member-mandate.dao.js";
import { AccountDao } from "./dao/account.dao.js";
import { NotificationDao } from "./dao/notification.dao.js";
import { RepaymentDao } from "./dao/repayment.dao.js";
import { StatementDao } from "./dao/statement.dao.js";
import { UserDao } from "./dao/user.dao.js";
import { UserKycDataDao } from "./dao/user-kyc-data.dao.js";
import { UserKycOtpDao } from "./dao/user-kyc-otp.dao.js";
import { KycVerificationDao } from "./dao/kyc-verification.dao.js";
import { requireOnboardingComplete as requireOnboardingCompleteFactory } from "./middlewares/onboarding.middleware.js";
import { ApprovalService } from "./services/approval.service.js";
import { AuthService } from "./services/auth.service.js";
import { KycService } from "./services/kyc.service.js";
import { NinService } from "./services/nin.service.js";
import { StatementSyncService } from "./services/statement-sync.service.js";
import { CreditService } from "./services/credit.service.js";
import { DashboardService } from "./services/dashboard.service.js";
import { AdminDashboardService } from "./services/admin-dashboard.service.js";
import { AdminKycService } from "./services/admin-kyc.service.js";
import { GroupService } from "./services/group.service.js";
import { InvitationService } from "./services/invitation.service.js";
import { NotificationService } from "./services/notification.service.js";
import { LoanService } from "./services/loan.service.js";
import { QuarterlyService } from "./services/quarterly.service.js";
import { RepaymentService } from "./services/repayment.service.js";
import { TrustService } from "./services/trust.service.js";
import { DefaultService } from "./services/default.service.js";
import { EmailService } from "./email/email.service.js";

function createContainer() {
  const dbDao = new DbDao();
  const userDao = new UserDao();
  const userKycDataDao = new UserKycDataDao();
  const userKycOtpDao = new UserKycOtpDao();
  const kycVerificationDao = new KycVerificationDao();
  const statementDao = new StatementDao();
  const groupDao = new GroupDao();
  const groupMemberDao = new GroupMemberDao();
  const groupInviteDao = new GroupInviteDao();
  const loanDao = new LoanDao();
  const loanApprovalDao = new LoanApprovalDao();
  const repaymentDao = new RepaymentDao();
  const notificationDao = new NotificationDao();
  const directDebitMandateDao = new DirectDebitMandateDao();
  const mandateDao = new MandateDao();
  const memberMandateDao = new MemberMandateDao();
  const accountDao = new AccountDao();

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
    mandateDao,
    memberMandateDao,
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
  const invitationService = new InvitationService(
    dbDao,
    groupInviteDao,
    groupMemberDao,
    groupDao,
    userDao,
    creditService,
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
  const adminDashboardService = new AdminDashboardService(loanDao, userDao, userKycDataDao, repaymentDao);
  const adminKycService = new AdminKycService(userDao, userKycDataDao, kycVerificationDao);

  const authController = new AuthController(authService);
  const invitationController = new InvitationController(invitationService);
  const ninService = new NinService(userKycDataDao, userKycOtpDao);
  const ninController = new NinController(ninService);
  const lookupController = new LookupController();
  const statementSyncService = new StatementSyncService(userDao, userKycDataDao, statementDao);
  const kycService = new KycService(userDao, userKycDataDao, kycVerificationDao, statementDao, statementSyncService);
  const kycController = new KycController(kycService);
  const dashboardController = new DashboardController(dashboardService);
  const adminDashboardController = new AdminDashboardController(adminDashboardService);
  const adminKycController = new AdminKycController(adminKycService);
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
    accountDao,
    memberMandateDao,
    notificationService,
    emailService
  );

  return {
    sequelize,
    emailService,
    authController,
    invitationController,
    ninController,
    lookupController,
    kycController,
    dashboardController,
    adminDashboardController,
    adminKycController,
    loanController,
    groupController,
    repaymentController,
    requireOnboardingComplete,
    directDebitMandateDao,
    mandateDao,
    memberMandateDao,
    accountDao,
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
