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
    <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Enlace Group Invitation</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f6f8f7; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f8f7;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); border: 1px solid rgba(19,236,128,0.2); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 40px; border-bottom: 1px solid rgba(19,236,128,0.1); background-color: #f6f8f7; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="{{baseUrl}}/logo-email.png" alt="Enlace" width="32" height="32" style="display: block; width: 32px; height: 32px;" />
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em;">Enlace</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero image -->
          <tr>
            <td style="padding: 0; line-height: 0;">
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuCbzDE0drAeBC-retXXJYU37tVbLxzN1eN3seh6pUlo3iXHcUXR_TcrKq4L9tmxW9EmHMSSA3GCiAlyHydjfN_VO_Ffg8qDbfRVkqYHjHBCg5F0cs9-qaP2LyQ_SGOyGVNKL3APAS3RbdvKtXKy8K67Zxjk45OlBAi4C7424hFulDTifLz1iH0PZzQFC_5ONg134UNL_gNZJ7T749TDO39dpD6GzTSMqOpCssUMlIo9-w-JEWT6Ehk5AutanMvorCy-33hIh4hOLQYS" alt="Diverse group of professionals collaborating together around a table" width="600" style="display: block; width: 100%; max-width: 600px; height: 256px; object-fit: cover; vertical-align: top;" />
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px 24px 32px; text-align: center;">
              <h1 style="margin: 0 0 24px 0; font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.2;">You've Been Added to a Credit Group on Enlace</h1>
              <p style="margin: 0 0 32px 0; font-size: 18px; line-height: 1.6; color: #475569;">Hello <strong style="color: #0f172a;">{{recipientName}}</strong>, <strong style="color: #0f172a;">{{inviterName}}</strong> has added you to the group <em style="color: #13ec80;">"{{groupName}}"</em> on Enlace.</p>

              <!-- Value proposition box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 40px auto; max-width: 100%; background-color: rgba(19,236,128,0.08); border: 1px solid rgba(19,236,128,0.25); border-radius: 12px;">
                <tr>
                  <td style="padding: 32px 24px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 500; color: #475569;">This group is working together to unlock up to:</p>
                    <p style="margin: 0; font-size: 32px; font-weight: 800; color: #13ec80; letter-spacing: -0.02em;">{{ProjectedCreditAmount}}</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #475569;">To activate your participation, click below to complete your sign up and set your password.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="{{acceptUrl}}" style="display: inline-block; padding: 16px 40px; background-color: #13ec80; color: #0f172a; font-size: 18px; font-weight: 700; text-decoration: none; text-align: center; border-radius: 9999px;">Complete Sign Up &amp; Join Group</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 40px 32px; background-color: #f6f8f7; border-top: 1px solid rgba(19,236,128,0.1);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 16px 0; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.15em;">Enlace Collaborative Lending</p>
                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #94a3b8;">© {{year}} Enlace Inc. All rights reserved.</p>
                    <p style="margin: 0 0 24px 0; font-size: 14px; color: #94a3b8;">123 Financial District, Suite 500, Tech City</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="padding: 0 8px;"><a href="{{baseUrl}}/privacy" style="font-size: 12px; font-weight: 600; color: #94a3b8; text-decoration: underline;">Privacy Policy</a></td>
                        <td style="padding: 0 8px; font-size: 12px; color: #94a3b8;">•</td>
                        <td style="padding: 0 8px;"><a href="{{baseUrl}}/terms" style="font-size: 12px; font-weight: 600; color: #94a3b8; text-decoration: underline;">Terms of Service</a></td>
                        <td style="padding: 0 8px; font-size: 12px; color: #94a3b8;">•</td>
                        <td style="padding: 0 8px;"><a href="{{unsubscribeUrl}}" style="font-size: 12px; font-weight: 600; color: #94a3b8; text-decoration: underline;">Unsubscribe</a></td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>

  `;
  const text = `Hi ${vars.recipientName},\n\nYou have been invited to join the group "${vars.groupName}"${vars.inviterName ? ` by ${vars.inviterName}` : ""}.\n\nSign in to your account to view the invitation and accept or decline.`;
  return { subject, html: layout(htmlBody, subject), text };
}
