// Project sub-actions: POST /api/projects/:id/<action>
import { z } from "zod";
import { body, fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import * as A from "@/server/actions";

export const runtime = "nodejs";
type P = { id: string; action: string };

export const POST = route<P>(async (req, { id, action }) => {
  const ctx = await requireCtx();
  const idem = req.headers.get("idempotency-key");
  switch (action) {
    case "run":
      return A.runStep(ctx, id, await body(req, A.StepIn), idem);
    case "clips":
      return A.createClip(ctx, id, await body(req, z.object({ title: z.string().trim().min(1).max(120), startMs: z.number().int().min(0), endMs: z.number().int().min(1) })));
    case "people":
      return A.addPerson(ctx, id, await body(req, A.PersonIn));
    case "consent": {
      const x = await body(req, z.object({ personId: z.string(), scope: z.enum(["appearance", "voice", "likeness"]).default("appearance") }));
      return A.requestConsent(ctx, id, x.personId, x.scope);
    }
    case "declare":
      return A.declare(ctx, id);
    case "links": {
      const x = await body(req, z.object({ trackId: z.string().nullable().default(null), label: z.string().trim().max(80).default("Review"), days: z.number().int().min(1).max(14).default(7) }));
      return A.createReviewLink(ctx, id, x.trackId, x.label, x.days);
    }
    case "comments": {
      const x = await body(req, z.object({ atMs: z.number().int().min(0).nullable(), body: z.string().trim().min(1).max(2000) }));
      return A.addComment(ctx, id, x.atMs, x.body);
    }
    case "outputs":
      return A.createOutput(ctx, id, await body(req, A.OutputIn), idem);
    case "listings":
      return A.createListing(ctx, id, await body(req, A.ListingIn));
    default:
      return fail(404, "Unknown action.");
  }
});
