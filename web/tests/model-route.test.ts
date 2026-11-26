import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, openTestDb, seedWorkspace, type Db } from "./helpers/testdb";
import { providerFor } from "../src/server/providers";

let db: Db;
beforeAll(async () => { db = await openTestDb(); });
afterAll(() => closeTestDb(db));

describe("task model routes", () => {
  it("uses the routed provider and model for that role, while other roles keep their defaults", () => {
    const ws = "route_case", user = "user_route_case", project = "project_route_case";
    seedWorkspace(db, ws, user, project);
    db.run("INSERT INTO provider(id,workspace_id,kind,label,base_url,model,roles,last_test_ok,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", "route_provider", ws, "groq", "Groq", "https://api.groq.com/openai/v1", "old-model", '["chat","plan"]', 1, user, 1);
    db.run("INSERT INTO provider(id,workspace_id,kind,label,base_url,model,roles,last_test_ok,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", "default_provider", ws, "groq", "Default", "https://api.groq.com/openai/v1", "default-model", '["clips"]', 1, user, 2);
    db.run("INSERT INTO model_route(workspace_id,role,provider_id,model,updated_by,updated_at) VALUES(?,?,?,?,?,?)", ws, "chat", "route_provider", "routed-model", user, 3);
    expect(providerFor(ws, "chat")).toMatchObject({ id: "route_provider", model: "routed-model" });
    expect(providerFor(ws, "clips")).toMatchObject({ id: "default_provider", model: "default-model" });
  });
});
