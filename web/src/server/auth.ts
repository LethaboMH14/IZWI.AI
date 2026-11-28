// Accounts, sessions and workspaces (better-auth organizations: owner, admin, member).
// Social sign-in and phone codes plug in here when their provider credentials exist (see docs/PLATFORM-PLAN.md).
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { passkey } from "@better-auth/passkey";
import { Pool } from "pg";
import { one, surviveDrops } from "./db";
import { STUDIO_URL } from "./env";
import { audit } from "./audit";
import { resetEmail, sendMail } from "./mail";

const authPool = process.env.IZWI_DB === "pglite" ? undefined : new Pool({ connectionString: process.env.DATABASE_URL });
if (authPool) surviveDrops(authPool);

export const auth = betterAuth({
  appName: "IZWI AI",
  database: authPool,
  baseURL: STUDIO_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true, minPasswordLength: 10, maxPasswordLength: 128, autoSignIn: true,
    // The link is single-use and expires in an hour. It is sent only through the configured SMTP service, never logged.
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      const mail = resetEmail(url);
      await sendMail({ to: user.email, subject: mail.subject, text: mail.text });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    // In the database, not in memory: limits survive restarts and hold across processes. npm run db:migrate creates the table.
    storage: "database",
    window: 60,
    max: 120,
    customRules: { "/sign-in/email": { window: 60, max: 8 }, "/sign-up/email": { window: 300, max: 6 } },
  },
  advanced: { cookiePrefix: "izwi" },
  // A new session (for example on a new device) starts in the person's first workspace, so members never
  // land on onboarding just because no workspace was active yet.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const m = await one<{ organizationId: string }>(`SELECT "organizationId" FROM member WHERE "userId" = ? ORDER BY "createdAt" LIMIT 1`, session.userId);
          return { data: { ...session, activeOrganizationId: m?.organizationId ?? null } };
        },
      },
    },
  },
  plugins: [
    // Optional passwordless sign-in with the device's fingerprint, face or PIN. rpID must match the site's hostname.
    passkey({ rpID: new URL(STUDIO_URL).hostname, rpName: "IZWI AI", origin: STUDIO_URL }),
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      membershipLimit: 50,
      // No email provider is configured: the invite link is shown in the app and can be shared on WhatsApp.
      async sendInvitationEmail(data) {
        await audit({ workspaceId: data.organization.id, userId: data.inviter.user.id, actor: "user", action: "invite.created", target: data.id, meta: { role: data.role } });
      },
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;

export async function closeAuthPool() {
  await authPool?.end();
}
