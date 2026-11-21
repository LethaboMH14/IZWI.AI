// npm run db:migrate: back up the database, create or update auth tables, then apply app migrations in order.
import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  const { DB_FILE, STORAGE } = await import("../src/server/env");
  const { db } = await import("../src/server/db");

  if (existsSync(DB_FILE) && statSync(DB_FILE).size > 0) {
    const dir = path.join(STORAGE, "backups");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `izwi-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
    await db.backup(file);
    console.log(`backup  ${path.relative(process.cwd(), file)}`);
  }

  const { auth } = await import("../src/server/auth");
  const { getMigrations } = await import("better-auth/db/migration");
  const plan = await getMigrations(auth.options);
  if (plan.toBeCreated.length || plan.toBeAdded.length) {
    await plan.runMigrations();
    console.log(`auth    created ${plan.toBeCreated.map((t) => t.table).join(", ") || "nothing"}; added columns on ${plan.toBeAdded.map((t) => t.table).join(", ") || "nothing"}`);
  } else console.log("auth    up to date");

  const { migrateApp, appliedVersion } = await import("../src/server/migrations");
  migrateApp((s) => console.log(`app     ${s}`));
  console.log(`schema  version ${appliedVersion()}`);
  const integrity = db.pragma("integrity_check", { simple: true });
  console.log(`check   integrity ${integrity}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
