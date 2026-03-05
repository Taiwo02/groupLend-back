import { escapeHtml, layout } from "./utils.js";

export type RepaymentReminderTemplateVars = {
  borrowerName: string;
  amount: number;
  dueDate: string;
  currency?: string;
};

export function repaymentReminderTemplate(
  vars: RepaymentReminderTemplateVars
): { subject: string; html: string; text: string } {
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
