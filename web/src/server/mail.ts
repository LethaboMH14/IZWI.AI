// Email for account messages (password reset). Sends through any SMTP service the team chooses, configured with
// IZWI_SMTP_URL (for example smtps://user:password@smtp.example.com:465) and IZWI_MAIL_FROM. With no configuration
// nothing is sent and nothing is logged: the reset link is a secret and never goes to a log.
import nodemailer from "nodemailer";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up on this site yet, so a reset link cannot be sent. Ask the site's administrator.");
  }
}

export function mailConfigured(): boolean {
  return !!process.env.IZWI_SMTP_URL && !!process.env.IZWI_MAIL_FROM;
}

export async function sendMail(args: { to: string; subject: string; text: string }): Promise<void> {
  if (!mailConfigured()) throw new MailNotConfiguredError();
  const transport = nodemailer.createTransport(process.env.IZWI_SMTP_URL);
  await transport.sendMail({ from: process.env.IZWI_MAIL_FROM, to: args.to, subject: args.subject, text: args.text });
}

export function resetEmail(url: string) {
  return {
    subject: "Reset your IZWI AI password",
    text: [
      "Someone asked to reset the password for your IZWI AI account.",
      "",
      `Choose a new password here: ${url}`,
      "",
      "The link works once and expires in one hour. If you did not ask for this, ignore this email; your password stays the same.",
    ].join("\n"),
  };
}
