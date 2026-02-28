import { SendMailClient } from "zeptomail";
import { env } from "../config/env.js";

export type MailTransport = {
  sendMail(options: {
    from: string;
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void>;
};

let transport: MailTransport | null | undefined = undefined;

function createTransport(): MailTransport | null {
  if (!env.zohoUrl || !env.zohoToken) return null;
  const client = new SendMailClient({ url: env.zohoUrl, token: env.zohoToken });
  return {
    async sendMail(options) {
      await client.sendMail({
        from: {
          address: options.from,
          name: env.mailFromName
        },
        to: [
          {
            email_address: {
              address: options.to,
              name: options.toName ?? options.to
            }
          }
        ],
        subject: options.subject,
        htmlbody: options.html
      });
    }
  };
}

export function getMailTransport(): MailTransport | null {
  if (transport === undefined) {
    transport = createTransport();
  }
  return transport;
}

export function isEmailConfigured(): boolean {
  return getMailTransport() !== null;
}
