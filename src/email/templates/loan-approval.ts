import { escapeHtml, layout } from "./utils.js";

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
