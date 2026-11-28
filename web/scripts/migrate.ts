// Create/update Better Auth's PostgreSQL schema, then apply the app baseline.
import { loadLocalEnv } from "../src/server/env";

async function main() {
  loadLocalEnv();
  const { auth, closeAuthPool } = await import("../src/server/auth");
  const { getMigrations } = await import("better-auth/db/migration");
  const plan = await getMigrations(auth.options);
  if (plan.toBeCreated.length || plan.toBeAdded.length) {
    await plan.runMigrations();
    console.log(`auth    created ${plan.toBeCreated.map((t) => t.table).join(", ") || "nothing"}; added columns on ${plan.toBeAdded.map((t) => t.table).join(", ") || "nothing"}`);
  } else console.log("auth    up to date");

  const { migrateApp, appliedVersion } = await import("../src/server/migrations");
  await migrateApp((s) => console.log(`app     ${s}`));
  console.log(`schema  version ${await appliedVersion()}`);
  await closeAuthPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
