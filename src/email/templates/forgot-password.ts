import { escapeHtml, layout } from "./utils.js";

export type ForgotPasswordTemplateVars = {
  fullName: string;
  /** Reset password URL (e.g. set-password?token=xxx). */
  resetUrl: string;
};

export function forgotPasswordTemplate(vars: ForgotPasswordTemplateVars): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your password";
  const htmlBody = `
    <p>Hi ${escapeHtml(vars.fullName)},</p>
    <p>We received a request to reset your password. Click the button below to set a new password:</p>
    <p style="margin: 24px 0;">
      <a href="${escapeHtml(vars.resetUrl)}" class="button">Reset password</a>
    </p>
    <p>This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
  `;
  const text = `Hi ${vars.fullName},\n\nWe received a request to reset your password. Open this link to set a new password:\n${vars.resetUrl}\n\nThis link expires in 1 hour. If you didn't request a password reset, you can ignore this email.`;
  return { subject, html: layout(htmlBody, subject), text };
}
