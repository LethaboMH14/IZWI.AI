// Hosted uploads, last step: join the parts from the bucket's own list, check the real bytes, record the source asset.
import { route } from "@/server/http";
import { s3Complete } from "@/server/upload";
import { refusals, uploader } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const who = await uploader();
  return refusals(() => s3Complete(who, id));
});
