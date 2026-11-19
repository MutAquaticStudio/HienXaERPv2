import "server-only";

import nodemailer from "nodemailer";

type Env = Record<string, string | undefined>;
export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type SendResult = { status: 200 | 422 | 502 | 503; error?: string };

/**
 * One SMTP path for every email the app sends itself (F5 automation jobs, D62 customer welcome): SMTP_HOST, SMTP_PORT
 * (465 = TLS, otherwise STARTTLS), SMTP_USER, SMTP_PASSWORD and SMTP_FROM from the app environment. Without them nothing is
 * sent and `smtp_not_configured` comes back; the caller decides whether that matters.
 */
export async function sendEmail(message: EmailMessage, env: Env = process.env): Promise<SendResult> {
  if (!message.to) return { status: 422, error: "missing_recipient" };
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return { status: 503, error: "smtp_not_configured" };
  const port = Number(env.SMTP_PORT ?? "465");
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } });
  try {
    await transport.sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
    return { status: 200 };
  } catch {
    return { status: 502, error: "smtp_failed" };
  }
}
