// Hosted uploads: which parts the bucket already holds (how a dropped upload resumes), or abort it.
import { route } from "@/server/http";
import { s3Abort, s3Status } from "@/server/upload";
import { refusals, uploader } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const who = await uploader();
  return refusals(() => s3Status(who, id));
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  const who = await uploader();
  await refusals(() => s3Abort(who, id));
  return { ok: true };
});
