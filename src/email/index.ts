export { EmailService } from "./email.service";
export { getMailTransport, isEmailConfigured } from "./transport";
export {
  welcomeTemplate,
  groupInviteTemplate,
  loanRequestTemplate,
  loanApprovalTemplate,
  loanRejectionTemplate,
  repaymentReminderTemplate,
  defaultAlertTemplate
} from "./templates";
export type {
  WelcomeTemplateVars,
  GroupInviteTemplateVars,
  LoanRequestTemplateVars,
  LoanApprovalTemplateVars,
  LoanRejectionTemplateVars,
  RepaymentReminderTemplateVars,
  DefaultAlertTemplateVars
} from "./templates";
