import { escapeHtml, layout } from "./utils.js";

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
