export { EmailService } from "./email.service.js";
export { getMailTransport, isEmailConfigured } from "./transport.js";
export {
  welcomeTemplate,
  groupInviteTemplate,
  loanRequestTemplate,
  loanApprovalTemplate,
  loanRejectionTemplate,
  repaymentReminderTemplate,
  defaultAlertTemplate
} from "./templates/index.js";
export type {
  WelcomeTemplateVars,
  GroupInviteTemplateVars,
  LoanRequestTemplateVars,
  LoanApprovalTemplateVars,
  LoanRejectionTemplateVars,
  RepaymentReminderTemplateVars,
  DefaultAlertTemplateVars
} from "./templates/index.js";
