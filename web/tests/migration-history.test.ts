import { afterAll, beforeAll, expect, it } from "vitest";
import { closeTestDb, openTestDb, type Db } from "./helpers/testdb";

let db: Db;
beforeAll(async () => { db = await openTestDb(); }, 60_000);
afterAll(async () => { await closeTestDb(db); });

it("migrates a fresh PGlite database to the single current baseline and is a no-op on rerun", async () => {
  const { appliedVersion, migrateApp, MIGRATIONS, SCHEMA_VERSION } = await import("../src/server/migrations");
  expect(MIGRATIONS).toHaveLength(1);
  expect(await appliedVersion()).toBe(SCHEMA_VERSION);
  const before = await db.one<{ count: number }>(`SELECT count(*) AS count FROM schema_migrations`);
  const logs: string[] = [];
  await migrateApp((line) => logs.push(line));
  const after = await db.one<{ count: number }>(`SELECT count(*) AS count FROM schema_migrations`);
  expect(after?.count).toBe(before?.count);
  expect(logs).toEqual([]);
  expect(await db.one(`SELECT asking_price_cents FROM listing LIMIT 0`)).toBeUndefined();
  expect(await db.one(`SELECT script FROM project LIMIT 0`)).toBeUndefined();
  expect(await db.one(`SELECT 1 FROM pg_indexes WHERE indexname = 'consent_ledger_prev_hash_unique'`)).toBeTruthy();
});
