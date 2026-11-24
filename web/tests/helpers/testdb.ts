// A real, throwaway SQLite file per test file. Import this module first: it sets the storage paths
// before any server module reads them.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "izwi-test-"));
process.env.IZWI_STORAGE_DIR = dir;
process.env.IZWI_DB_FILE = path.join(dir, "test.db");
process.env.IZWI_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64url");

export const TEST_DIR = dir;

export type Db = typeof import("../../src/server/db");

// better-auth owns these tables in the app; the migrations and the guards only need these columns.
export async function openTestDb(): Promise<Db> {
  const db = await import("../../src/server/db");
  db.db.exec(`
    CREATE TABLE IF NOT EXISTS organization (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS member (id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, userId TEXT NOT NULL, role TEXT NOT NULL);
  `);
  (await import("../../src/server/migrations")).migrateApp(() => {});
  return db;
}

export function seedWorkspace(db: Db, ws: string, user: string, project: string) {
  db.run(`INSERT OR IGNORE INTO organization (id) VALUES (?)`, ws);
  db.run(`INSERT OR IGNORE INTO "user" (id) VALUES (?)`, user);
  db.run(`INSERT OR IGNORE INTO member (id, organizationId, userId, role) VALUES (?, ?, ?, 'owner')`, `mem_${ws}_${user}`, ws, user);
  db.run(
    `INSERT INTO project (id, workspace_id, title, kind, created_by, created_at, updated_at) VALUES (?, ?, 'Test', 'podcast', ?, 0, 0)`,
    project, ws, user,
  );
  return { userId: user, userName: "Naledi", email: `${user}@example.test`, workspaceId: ws, role: "owner" };
}

export function closeTestDb(db: Db | undefined) {
  db?.db.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the WAL file; the OS temp dir is cleaned later.
  }
}
