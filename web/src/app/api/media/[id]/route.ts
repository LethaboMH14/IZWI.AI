// Streams a stored file with byte ranges. Members of the workspace can open anything in it; a review or consent
// token opens only that project's light preview and cover; a listing slug opens only that clip's finished render.
// Hosted (s3 mode): the same checks, then a redirect to a short-lived presigned URL on the private bucket.
import { existsSync } from "node:fs";
import { fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { one } from "@/server/db";
import { absPath, signedGetUrl, storageMode, streamFile } from "@/server/storage";
import { assetAllowedForToken } from "@/server/public";

export const runtime = "nodejs";

type Asset = { id: string; storage_key: string; mime: string; filename: string };

export const GET = route<{ id: string }>(async (req, { id }) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const slug = url.searchParams.get("l");
  let asset: Asset | undefined;
  if (token || slug) {
    const ok = await assetAllowedForToken(id, token, slug);
    if (ok) asset = await one<Asset>(`SELECT id, storage_key, mime, filename FROM asset WHERE id = ?`, ok.id);
  }
  if (!asset) {
    const ctx = await requireCtx();
    asset = await one<Asset>(`SELECT id, storage_key, mime, filename FROM asset WHERE id = ? AND workspace_id = ?`, id, ctx.workspaceId);
  }
  if (!asset) fail(404, "Not found.");
  const download = url.searchParams.has("download") ? asset.filename : undefined;
  if (storageMode() === "s3") {
    // One hour, so seeking in a long video never hits an expired link. Presigned URLs cannot be revoked early.
    const signed = await signedGetUrl(asset.storage_key, asset.mime, { download, seconds: 3600 });
    return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const file = absPath(asset.storage_key);
  if (!existsSync(file)) fail(404, "The file is missing from storage.");
  return streamFile(req, file, asset.mime, { download, cache: token || slug ? "no-store" : undefined });
});
