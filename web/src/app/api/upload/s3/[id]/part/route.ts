// Hosted uploads: a one-hour URL for one part. The browser PUTs that part straight to the bucket.
import { z } from "zod";
import { body, route } from "@/server/http";
import { s3SignPart } from "@/server/upload";
import { refusals, uploader } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const who = await uploader();
  const x = await body(req, z.object({ partNumber: z.number().int().min(1).max(10_000) }));
  return refusals(() => s3SignPart(who, id, x.partNumber));
});
