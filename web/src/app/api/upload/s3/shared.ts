// Shared by the hosted upload routes: who is calling, and the hosted-only switch.
import { fail, HttpError } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { storageMode } from "@/server/storage";
import { UploadRefused } from "@/server/upload";

export async function uploader() {
  if (storageMode() !== "s3") fail(404, "Not found.");
  const ctx = await requireCtx();
  return { userId: ctx.userId, workspaceId: ctx.workspaceId };
}

export async function refusals<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UploadRefused) throw new HttpError(e.status, e.message);
    throw e;
  }
}
