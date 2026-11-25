import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const shared = globalThis as typeof globalThis & { __izwiDb?: unknown; __izwiStmts?: unknown };

for (const history of ["clean", "hardening", "studio"] as const) {
  it(`reconciles the ${history} migration history and runs twice safely`, async () => {
    const folder = mkdtempSync(path.join(tmpdir(), "izwi-migration-"));
    vi.stubEnv("IZWI_DB_FILE", path.join(folder, "fixture.db"));
    vi.resetModules();
    const { db } = await import("../src/server/db");
    try {
      const { MIGRATIONS, migrateApp } = await import("../src/server/migrations");
      db.exec('CREATE TABLE organization (id TEXT PRIMARY KEY); CREATE TABLE "user" (id TEXT PRIMARY KEY);');
      if (history !== "clean") {
        db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)");
        for (const version of history === "studio" ? [1] : [1, 2]) {
          const entry = MIGRATIONS.find((migration) => migration.version === version);
          if (!entry || !("sql" in entry)) throw new Error("Missing historical SQL.");
          db.exec(entry.sql);
          db.prepare("INSERT INTO schema_migrations VALUES (?, ?, 0)").run(version, entry.name);
        }
      }
      if (history === "studio") {
        db.exec(`
          ALTER TABLE listing ADD COLUMN asking_price_cents INTEGER;
          ALTER TABLE project ADD COLUMN script TEXT NOT NULL DEFAULT '';
          INSERT INTO schema_migrations VALUES (2, 'listing asking price', 0), (3, 'project storyboard', 0);
          INSERT INTO organization VALUES ('ws');
          INSERT INTO "user" VALUES ('user');
          INSERT INTO project (id, workspace_id, title, kind, created_by, created_at, updated_at, script)
          VALUES ('project', 'ws', 'Story', 'podcast', 'user', 0, 0, 'My original script');
        `);
      }
      migrateApp(() => {});
      migrateApp(() => {});
      expect(db.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('rate_limit','consent_ledger') ORDER BY name").all())
        .toEqual([{ name: "consent_ledger" }, { name: "rate_limit" }]);
      expect(db.prepare("SELECT 1 FROM pragma_table_info('listing') WHERE name = 'asking_price_cents'").get()).toBeTruthy();
      expect(db.prepare("SELECT 1 FROM pragma_table_info('project') WHERE name = 'script'").get()).toBeTruthy();
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 5 });
      for (const table of ["assistant_thread", "assistant_message", "assistant_lease", "assistant_budget", "line_injection_scan"]) {
        expect(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeTruthy();
      }
      expect(db.prepare("SELECT 1 FROM pragma_table_info('job') WHERE name = 'priority'").get()).toBeTruthy();
      db.exec(`
        INSERT OR IGNORE INTO organization (id) VALUES ('provider-ws');
        INSERT OR IGNORE INTO "user" (id) VALUES ('provider-user');
        INSERT INTO provider (id, workspace_id, kind, label, base_url, model, roles, created_by, created_at)
          VALUES ('openrouter-fixture', 'provider-ws', 'openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'demo:free', '["chat"]', 'provider-user', 0);
      `);
      if (history === "studio") {
        expect(db.prepare("SELECT script FROM project WHERE id = 'project'").get()).toEqual({ script: "My original script" });
        expect(db.prepare("SELECT name FROM schema_migrations WHERE version = 2").get()).toEqual({ name: "listing asking price" });
        db.exec(`
          INSERT INTO assistant_thread (id, workspace_id, project_id, created_by, created_at) VALUES ('thread', 'ws', 'project', 'user', 0);
          INSERT INTO assistant_message (id, thread_id, workspace_id, project_id, role, text, created_at)
            VALUES ('message', 'thread', 'ws', 'project', 'assistant', 'reply', 0);
          DELETE FROM project WHERE id = 'project';
        `);
        expect(db.prepare("SELECT 1 FROM assistant_thread WHERE id = 'thread'").get()).toBeUndefined();
        expect(db.prepare("SELECT 1 FROM assistant_message WHERE id = 'message'").get()).toBeUndefined();
      }
    } finally {
      db.close();
      delete shared.__izwiDb;
      delete shared.__izwiStmts;
      vi.unstubAllEnvs();
      rmSync(folder, { recursive: true, force: true });
    }
  }, 30_000); // Full schema build, three times over; slow laptops exceed the 5 s default.
}
