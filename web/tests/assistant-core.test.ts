import "./helpers/testdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";

let db: Db;
let redact: typeof import("../src/server/assistant").redactForMayLog;
let canaryFilter: typeof import("../src/app/api/projects/[id]/assistant/route").canaryFilter;
beforeAll(async () => {
  db = await openTestDb();
  const assistant = await import("../src/server/assistant");
  redact = assistant.redactForMayLog;
  canaryFilter = (await import("../src/app/api/projects/[id]/assistant/route")).canaryFilter;
}, 60_000);
afterAll(async () => await closeTestDb(db));

describe("assistant privacy and stream checks", () => {
  it("redacts South African identifiers, email, phone and project people before may_log", () => {
    const source = "Naledi 0821234567 naledi@example.org 8001015009087";
    const result = redact(source, ["Naledi"]);
    expect(result.count).toBeGreaterThanOrEqual(4);
    expect(result.text).not.toContain("naledi@example.org");
    expect(result.text).not.toContain("0821234567");
    expect(result.text).not.toContain("8001015009087");
    expect(redact(source, []).count).toBeGreaterThanOrEqual(3);
  });

  it("detects a canary split across delta boundaries", () => {
    const filter = canaryFilter("IZWI_CANARY_abc123");
    expect(filter.push("safe IZWI_CANARY_")).toBe("");
    expect(() => filter.push("abc123 unsafe")).toThrow("CANARY");
  });

  it("keeps assistant rows scoped to a project and project cascade removes them", async () => {
    const ctx = await seedWorkspace(db, "org_core", "user_core", "project_core");
    (await db.run(`INSERT INTO assistant_thread (id, workspace_id, project_id, created_by, created_at) VALUES ('thread_core', ?, 'project_core', ?, 1)`, ctx.workspaceId, ctx.userId));
    (await db.run(`INSERT INTO assistant_message (id, thread_id, workspace_id, project_id, role, text, provider_id, provider_label, model, privacy, redacted, proposals, outcome, request_id, created_at) VALUES ('message_core', 'thread_core', ?, 'project_core', 'user', 'safe', 'provider', 'Local', 'model', 'private', 0, '[]', 'complete', 'request', 1)`, ctx.workspaceId));
    (await db.run(`DELETE FROM project WHERE id = 'project_core'`));
    expect((await db.one(`SELECT id FROM assistant_message WHERE id = 'message_core'`))).toBeUndefined();
  });
});
