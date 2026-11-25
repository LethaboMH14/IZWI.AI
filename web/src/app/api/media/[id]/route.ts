// Streams a stored file with byte ranges. Members of the workspace can open anything in it; a review or consent
// token opens only that project's light preview and cover; a listing slug opens only that clip's finished render.
import { existsSync } from "node:fs";
import { fail, route } from "@/server/http";
import { requireCtx } from "@/server/guard";
import { one } from "@/server/db";
import { absPath, streamFile } from "@/server/storage";
import { assetAllowedForToken } from "@/server/public";

export const runtime = "nodejs";

type Asset = { id: string; storage_key: string; mime: string; filename: string };

export const GET = route<{ id: string }>(async (req, { id }) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const slug = url.searchParams.get("l");
  let asset: Asset | undefined;
  if (token || slug) {
    const ok = assetAllowedForToken(id, token, slug);
    if (ok) asset = one<Asset>(`SELECT id, storage_key, mime, filename FROM asset WHERE id = ?`, ok.id);
  }
  if (!asset) {
    const ctx = await requireCtx();
    asset = one<Asset>(`SELECT id, storage_key, mime, filename FROM asset WHERE id = ? AND workspace_id = ?`, id, ctx.workspaceId);
  }
  if (!asset) fail(404, "Not found.");
  const file = absPath(asset.storage_key);
  if (!existsSync(file)) fail(404, "The file is missing from storage.");
  return streamFile(req, file, asset.mime, { download: url.searchParams.has("download") ? asset.filename : undefined, cache: token || slug ? "no-store" : undefined });
});
