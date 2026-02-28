import { env } from "../config/env";

const APP_NAME = env.appName;

function layout(htmlBody: string, subject: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; color: #1a1a1a; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; }
    .header { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 24px; }
    .content { margin-bottom: 24px; }
    .footer { font-size: 12px; color: #64748b; }
    .button { display: inline-block; padding: 12px 20px; background: #0f172a; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: 500; }
    .highlight { background: #f1f5f9; padding: 12px; border-radius: 8px; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${escapeHtml(APP_NAME)}</div>
    <div class="content">${htmlBody}</div>
    <div class="footer">This email was sent by ${escapeHtml(APP_NAME)}. Please do not reply to this address.</div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type WelcomeTemplateVars = {
  fullName: string;
};

export function welcomeTemplate(vars: WelcomeTemplateVars): { subject: string; html: string; text: string } {
  const subject = `Welcome to ${APP_NAME}`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.fullName)},</p>
    <p>Your account has been created. You can now sign in and complete your profile, set your loan PIN, and join or create groups.</p>
    <p>If you did not create this account, please ignore this email.</p>
  `;
  const text = `Hi ${vars.fullName},\n\nYour account has been created. You can now sign in and complete your profile, set your loan PIN, and join or create groups.\n\nIf you did not create this account, please ignore this email.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type GroupInviteTemplateVars = {
  recipientName: string;
  groupName: string;
  inviterName?: string;
};

export function groupInviteTemplate(vars: GroupInviteTemplateVars): { subject: string; html: string; text: string } {
  const subject = `You're invited to join "${vars.groupName}"`;
  const inviter = vars.inviterName ? ` by ${escapeHtml(vars.inviterName)}` : "";
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.recipientName)},</p>
    <p>You have been invited to join the group <strong>${escapeHtml(vars.groupName)}</strong>${inviter}.</p>
    <p>Sign in to your account to view the invitation and accept or decline.</p>
  `;
  const text = `Hi ${vars.recipientName},\n\nYou have been invited to join the group "${vars.groupName}"${vars.inviterName ? ` by ${vars.inviterName}` : ""}.\n\nSign in to your account to view the invitation and accept or decline.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type LoanRequestTemplateVars = {
  approverName: string;
  borrowerName: string;
  amount: number;
  currency?: string;
};

export function loanRequestTemplate(vars: LoanRequestTemplateVars): { subject: string; html: string; text: string } {
  const currency = vars.currency ?? "NGN";
  const subject = `Loan request of ${currency} ${vars.amount.toLocaleString()} pending your approval`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.approverName)},</p>
    <p><strong>${escapeHtml(vars.borrowerName)}</strong> has requested a group loan of <span class="highlight">${currency} ${vars.amount.toLocaleString()}</span>.</p>
    <p>Sign in to review and approve or reject the request.</p>
  `;
  const text = `Hi ${vars.approverName},\n\n${vars.borrowerName} has requested a group loan of ${currency} ${vars.amount.toLocaleString()}.\n\nSign in to review and approve or reject the request.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type LoanApprovalTemplateVars = {
  borrowerName: string;
  amount: number;
  currency?: string;
};

export function loanApprovalTemplate(vars: LoanApprovalTemplateVars): { subject: string; html: string; text: string } {
  const currency = vars.currency ?? "NGN";
  const subject = `Your loan of ${currency} ${vars.amount.toLocaleString()} was approved`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.borrowerName)},</p>
    <p>Good news — your loan request of <strong>${currency} ${vars.amount.toLocaleString()}</strong> has been approved.</p>
    <p>Sign in to view details and next steps.</p>
  `;
  const text = `Hi ${vars.borrowerName},\n\nGood news — your loan request of ${currency} ${vars.amount.toLocaleString()} has been approved.\n\nSign in to view details and next steps.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type LoanRejectionTemplateVars = {
  borrowerName: string;
  amount: number;
  currency?: string;
};

export function loanRejectionTemplate(vars: LoanRejectionTemplateVars): { subject: string; html: string; text: string } {
  const currency = vars.currency ?? "NGN";
  const subject = `Update on your loan request (${currency} ${vars.amount.toLocaleString()})`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.borrowerName)},</p>
    <p>Your loan request of <strong>${currency} ${vars.amount.toLocaleString()}</strong> was not approved at this time.</p>
    <p>Sign in to view details or submit a new request when ready.</p>
  `;
  const text = `Hi ${vars.borrowerName},\n\nYour loan request of ${currency} ${vars.amount.toLocaleString()} was not approved at this time.\n\nSign in to view details or submit a new request when ready.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type RepaymentReminderTemplateVars = {
  borrowerName: string;
  amount: number;
  dueDate: string;
  currency?: string;
};

export function repaymentReminderTemplate(vars: RepaymentReminderTemplateVars): { subject: string; html: string; text: string } {
  const currency = vars.currency ?? "NGN";
  const subject = `Reminder: repayment of ${currency} ${vars.amount.toLocaleString()} due ${vars.dueDate}`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.borrowerName)},</p>
    <p>This is a reminder that a repayment of <strong>${currency} ${vars.amount.toLocaleString()}</strong> is due on <strong>${escapeHtml(vars.dueDate)}</strong>.</p>
    <p>Sign in to make a payment or view your loan details.</p>
  `;
  const text = `Hi ${vars.borrowerName},\n\nReminder: repayment of ${currency} ${vars.amount.toLocaleString()} is due on ${vars.dueDate}.\n\nSign in to make a payment or view your loan details.`;
  return { subject, html: layout(htmlBody, subject), text };
}

export type DefaultAlertTemplateVars = {
  borrowerName: string;
  loanId: string;
};

export function defaultAlertTemplate(vars: DefaultAlertTemplateVars): { subject: string; html: string; text: string } {
  const subject = `Alert: loan in default`;
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.borrowerName)},</p>
    <p>Your loan (reference: ${escapeHtml(vars.loanId)}) is now in default due to missed repayment(s).</p>
    <p>Please sign in to address this as soon as possible to avoid further impact on your standing.</p>
  `;
  const text = `Hi ${vars.borrowerName},\n\nYour loan (reference: ${vars.loanId}) is now in default due to missed repayment(s).\n\nPlease sign in to address this as soon as possible.`;
  return { subject, html: layout(htmlBody, subject), text };
}
