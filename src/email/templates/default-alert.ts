import { escapeHtml, layout } from "./utils.js";

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
