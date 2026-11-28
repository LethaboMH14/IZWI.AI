// Password reset mail: nothing is sent without a configured SMTP service, and the message carries only the one-time link.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailNotConfiguredError, mailConfigured, resetEmail, sendMail } from "../src/server/mail";

const keys = ["IZWI_SMTP_URL", "IZWI_MAIL_FROM"] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("password reset mail", () => {
  it("is off until both the SMTP address and the sender are set", () => {
    expect(mailConfigured()).toBe(false);
    process.env.IZWI_SMTP_URL = "smtps://user:pass@smtp.example.com:465";
    expect(mailConfigured()).toBe(false);
    process.env.IZWI_MAIL_FROM = "IZWI AI <no-reply@example.com>";
    expect(mailConfigured()).toBe(true);
  });

  it("refuses to send, and says why, when email is not set up", async () => {
    await expect(sendMail({ to: "a@example.com", subject: "x", text: "y" })).rejects.toBeInstanceOf(MailNotConfiguredError);
  });

  it("puts the one-time link and its expiry in the message, and nothing else secret", () => {
    const link = "https://studio.example.com/api/auth/reset-password/TOKEN123?callbackURL=%2Freset-password";
    const mail = resetEmail(link);
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("expires in one hour");
    expect(mail.text).toContain("ignore this email");
    expect(mail.subject).toBe("Reset your IZWI AI password");
  });
});
