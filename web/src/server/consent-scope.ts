import { z } from "zod";
import { CONSENT_SCOPES as SCOPE_LABELS, type ConsentScopeId } from "../lib/consent-scope";

// One source of truth: the scope ids come from lib/consent-scope.ts, which also holds their on-screen labels.
export const CONSENT_SCOPES = Object.keys(SCOPE_LABELS) as [ConsentScopeId, ...ConsentScopeId[]];
export const ConsentScopeSchema = z.enum(CONSENT_SCOPES);
export type ConsentScope = z.infer<typeof ConsentScopeSchema>;
