import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { SendMailClient } from "zeptomail";
import { env } from "../config/env";

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

function createZeptomailTransport(): MailTransport | null {
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

function createNodemailerTransport(): Transporter | null {
  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) return null;
  return nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: { user: env.smtpUser, pass: env.smtpPass }
  });
}

function createTransport(): MailTransport | null {
  const zepto = createZeptomailTransport();
  if (zepto) return zepto;
  const nodemailerTransport = createNodemailerTransport();
  if (!nodemailerTransport) return null;
  return {
    async sendMail(options) {
      await nodemailerTransport.sendMail({
        from: options.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text ?? options.html.replace(/<[^>]+>/g, "").trim()
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
