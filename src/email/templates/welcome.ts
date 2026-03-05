import { env } from "../../config/env.js";
import { escapeHtml } from "./utils.js";

const APP_NAME = env.appName;

export type WelcomeTemplateVars = {
  fullName: string;
  /** Base URL for frontend (links, logo). Falls back to FRONTEND_URL env. */
  baseUrl?: string;
  /** Verify email URL (e.g. verify-email?token=xxx). Required for email verification flow. */
  verifyUrl?: string;
};

const WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Welcome to Enlace</title>
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
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width: 640px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 40px; border-bottom: 1px solid #f1f5f9; text-align: center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <img src="{{baseUrl}}/logo-email.png" alt="Enlace" width="32" height="32" style="display: block; width: 32px; height: 32px;" />
                        </td>
                        <td style="vertical-align: middle;">
                          <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em;">Enlace</span>
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
              <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuAI7fJ8Mp0a62-E316Cna74He8s2JovLkiwxdyFu9wmKrPf6Z14lEaMVNy2wgv2fpi6rJz38oY8W3sGr7XUJ8mHYpEm7f6Pylvm8BiYXvNFctpzQ_EnJYfWsLa9_81OSsuO1tOT_d7NCdUL6La_n6KxPzMezw8Q1cKxYykYGjessDqOd45EX3Jduz7S9u3zNT73RlirUKv75c0_ylX-UDq7IIGOK7o-bB4ot5kJCIu_GHjjMFV7286nCJMldEV6rgSZS3ZDR2E2Zsfp" alt="A person holding a smartphone showing financial growth charts and green accents" width="640" style="display: block; width: 100%; max-width: 640px; height: 280px; object-fit: cover; vertical-align: top;" />
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding: 40px 32px; text-align: center;">
              <h1 style="margin: 0 0 20px 0; font-size: 28px; font-weight: 700; color: #0f172a; line-height: 1.2; letter-spacing: -0.025em;">Welcome to Enlace — Let's Unlock Your Credit.</h1>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width: 480px; margin: 0 auto;">
                <tr>
                  <td style="padding: 0 0 16px 0;">
                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #475569;">Hello <strong style="color: #0f172a;">{{firstName}}</strong>, Welcome to Enlace. You've successfully created your account.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 16px 0;">
                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #475569;">You're one step closer to accessing structured credit built on trust and credibility. To unlock your credit eligibility: Log in and complete your income details.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0 0 24px 0;">
                    <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #475569;">The sooner you complete your onboarding, the faster your credit limit is generated.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <a href="{{verifyUrl}}" style="display: inline-block; padding: 16px 32px; background-color: #13ec80; color: #0f172a; font-size: 18px; font-weight: 700; text-decoration: none; text-align: center; border-radius: 12px;">Verify your email</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 48px 32px; background-color: #f6f8f7; border-top: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin: 0 auto 24px auto;">
                      <tr>
                        <td style="padding: 0 16px;"><a href="{{baseUrl}}/support" style="font-size: 12px; font-weight: 600; color: #64748b; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em;">Support</a></td>
                        <td style="padding: 0 16px;"><a href="{{baseUrl}}/security" style="font-size: 12px; font-weight: 600; color: #64748b; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em;">Security</a></td>
                        <td style="padding: 0 16px;"><a href="{{baseUrl}}/privacy" style="font-size: 12px; font-weight: 600; color: #64748b; text-decoration: none; text-transform: uppercase; letter-spacing: 0.1em;">Privacy</a></td>
                      </tr>
                    </table>
                    <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">© {{year}} Enlace Collaborative Lending Platform. All rights reserved.</p>
                    <p style="margin: 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">If you did not create this account, please disregard this email or contact support immediately.</p>
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
</html>`;

function replaceAll(html: string, vars: Record<string, string>): string {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return out;
}

export function welcomeTemplate(vars: WelcomeTemplateVars): { subject: string; html: string; text: string } {
  const baseUrl = (vars.baseUrl ?? env.frontendUrl).replace(/\/$/, "") || "#";
  const verifyUrl = vars.verifyUrl ?? "#";
  const firstName = vars.fullName.trim().split(/\s+/)[0] || vars.fullName;
  const year = String(new Date().getFullYear());

  const html = replaceAll(WELCOME_HTML, {
    baseUrl,
    verifyUrl,
    firstName: escapeHtml(firstName),
    year
  });

  const subject = `Welcome to ${APP_NAME}`;
  const text = `Hi ${vars.fullName},\n\nYour account has been created. Please verify your email by clicking the link we sent you, then sign in and complete your profile.\n\nIf you did not create this account, please ignore this email.`;
  return { subject, html, text };
}
