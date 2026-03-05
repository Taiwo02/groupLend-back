import { env } from "../../config/env.js";

export const APP_NAME = env.appName;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(htmlBody: string, subject: string): string {
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
