"use client";
// Browser-side auth: email + password, passkeys, and workspace (organization) actions. Same-origin, cookie session.
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({ plugins: [organizationClient(), passkeyClient()] });
