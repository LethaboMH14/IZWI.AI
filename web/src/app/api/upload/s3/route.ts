// Hosted uploads, step 1: check the request and open a multipart upload on the private bucket.
import { z } from "zod";
import { body, route } from "@/server/http";
import { s3Create } from "@/server/upload";
import { refusals, uploader } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const who = await uploader();
  const x = await body(req, z.object({ projectId: z.string().min(1).max(80), filename: z.string().min(1).max(400), size: z.number().int().positive(), type: z.string().max(200).default("") }));
  return refusals(() => s3Create(who, x));
});
