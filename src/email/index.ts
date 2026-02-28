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
} from "./templates.js";
export type {
  WelcomeTemplateVars,
  GroupInviteTemplateVars,
  LoanRequestTemplateVars,
  LoanApprovalTemplateVars,
  LoanRejectionTemplateVars,
  RepaymentReminderTemplateVars,
  DefaultAlertTemplateVars
} from "./templates.js";
