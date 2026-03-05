import { escapeHtml, layout } from "./utils.js";

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
