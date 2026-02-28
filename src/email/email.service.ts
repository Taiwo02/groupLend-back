import { getMailTransport } from "./transport";
import {
  welcomeTemplate,
  groupInviteTemplate,
  loanRequestTemplate,
  loanApprovalTemplate,
  loanRejectionTemplate,
  repaymentReminderTemplate,
  defaultAlertTemplate,
  type WelcomeTemplateVars,
  type GroupInviteTemplateVars,
  type LoanRequestTemplateVars,
  type LoanApprovalTemplateVars,
  type LoanRejectionTemplateVars,
  type RepaymentReminderTemplateVars,
  type DefaultAlertTemplateVars
} from "./templates";
import { env } from "../config/env";

export class EmailService {
  async sendMail(options: {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    const transport = getMailTransport();
    if (!transport) return false;
    try {
      await transport.sendMail({
        from: env.mailFrom,
        to: options.to,
        toName: options.toName,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, "").trim()
      });
      return true;
    } catch {
      return false;
    }
  }

  async sendWelcome(to: string, vars: WelcomeTemplateVars): Promise<boolean> {
    const { subject, html, text } = welcomeTemplate(vars);
    return this.sendMail({ to, toName: vars.fullName, subject, html, text });
  }

  async sendGroupInvite(to: string, vars: GroupInviteTemplateVars): Promise<boolean> {
    const { subject, html, text } = groupInviteTemplate(vars);
    return this.sendMail({ to, toName: vars.recipientName, subject, html, text });
  }

  async sendLoanRequest(to: string, vars: LoanRequestTemplateVars): Promise<boolean> {
    const { subject, html, text } = loanRequestTemplate(vars);
    return this.sendMail({ to, toName: vars.approverName, subject, html, text });
  }

  async sendLoanApproval(to: string, vars: LoanApprovalTemplateVars): Promise<boolean> {
    const { subject, html, text } = loanApprovalTemplate(vars);
    return this.sendMail({ to, toName: vars.borrowerName, subject, html, text });
  }

  async sendLoanRejection(to: string, vars: LoanRejectionTemplateVars): Promise<boolean> {
    const { subject, html, text } = loanRejectionTemplate(vars);
    return this.sendMail({ to, toName: vars.borrowerName, subject, html, text });
  }

  async sendRepaymentReminder(to: string, vars: RepaymentReminderTemplateVars): Promise<boolean> {
    const { subject, html, text } = repaymentReminderTemplate(vars);
    return this.sendMail({ to, toName: vars.borrowerName, subject, html, text });
  }

  async sendDefaultAlert(to: string, vars: DefaultAlertTemplateVars): Promise<boolean> {
    const { subject, html, text } = defaultAlertTemplate(vars);
    return this.sendMail({ to, toName: vars.borrowerName, subject, html, text });
  }
}
