// Import this module before server modules so they see the in-process Postgres driver.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.IZWI_DB = "pglite";
const dir = mkdtempSync(path.join(tmpdir(), "izwi-test-"));
process.env.IZWI_STORAGE_DIR = dir;
process.env.IZWI_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64url");

export const TEST_DIR = dir;
export type Db = typeof import("../../src/server/db");

export async function openTestDb(): Promise<Db> {
  const db = await import("../../src/server/db");
  await db.execScript(`
    CREATE TABLE IF NOT EXISTS organization (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS member (id TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, role TEXT NOT NULL, "createdAt" BIGINT NOT NULL DEFAULT 0);
  `);
  await (await import("../../src/server/migrations")).migrateApp(() => {});
  return db;
}

export async function seedWorkspace(db: Db, ws: string, user: string, project: string) {
  await db.run(`INSERT INTO organization (id) VALUES (?) ON CONFLICT DO NOTHING`, ws);
  await db.run(`INSERT INTO "user" (id) VALUES (?) ON CONFLICT DO NOTHING`, user);
  await db.run(`INSERT INTO member (id, "organizationId", "userId", role) VALUES (?, ?, ?, 'owner') ON CONFLICT DO NOTHING`, `mem_${ws}_${user}`, ws, user);
  await db.run(
    `INSERT INTO project (id, workspace_id, title, kind, created_by, created_at, updated_at) VALUES (?, ?, 'Test', 'podcast', ?, 0, 0) ON CONFLICT DO NOTHING`,
    project, ws, user,
  );
  return { userId: user, userName: "Naledi", email: `${user}@example.test`, workspaceId: ws, role: "owner" };
}

export async function closeTestDb(db: Db | undefined) {
  if (db) await db.closeDb();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may retain temp storage briefly. */ }
}
