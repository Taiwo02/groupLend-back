import { escapeHtml, layout } from "./utils.js";

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
