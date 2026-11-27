// The Postgres data layer on in-process PGlite: placeholder rewriting, transactions, bigint parsing.
import { afterAll, describe, expect, it } from "vitest";

process.env.IZWI_DB = "pglite";
const db = await import("../src/server/db");

afterAll(() => db.closeDb());

describe("toPg", () => {
  it("numbers placeholders and leaves quoted text alone", () => {
    expect(db.toPg(`SELECT ? , '?' , "a?b", ? -- what?\n, ?`)).toBe(`SELECT $1 , '?' , "a?b", $2 -- what?\n, $3`);
  });
});

describe("queries and transactions", () => {
  it("runs, counts changes and parses bigint as number", async () => {
    await db.execScript(`CREATE TABLE t (id TEXT PRIMARY KEY, at BIGINT NOT NULL); CREATE TABLE u (n INTEGER);`);
    expect((await db.run(`INSERT INTO t (id, at) VALUES (?, ?), (?, ?)`, "a", 1_795_000_000_000, "b", 2)).changes).toBe(2);
    const r = await db.one<{ at: number }>(`SELECT at FROM t WHERE id = ?`, "a");
    expect(r?.at).toBe(1_795_000_000_000);
    const s = await db.one<{ s: number }>(`SELECT SUM(at) AS s FROM t`);
    expect(s?.s).toBe(1_795_000_000_002);
  });

  it("rolls back a failed transaction, including nested helpers", async () => {
    const insert = (id: string) => db.run(`INSERT INTO t (id, at) VALUES (?, 0)`, id);
    await expect(db.tx(async () => {
      await insert("c");
      await db.tx(async () => insert("d")); // joins the outer transaction
      throw new Error("stop");
    })).rejects.toThrow("stop");
    expect(await db.all(`SELECT id FROM t WHERE id IN ('c','d')`)).toEqual([]);
  });

  it("commits a successful transaction", async () => {
    await db.tx(async () => {
      await db.run(`INSERT INTO t (id, at) VALUES (?, 0)`, "e");
      await db.lockKey("ledger:x");
    });
    expect(await db.one(`SELECT id FROM t WHERE id = ?`, "e")).toEqual({ id: "e" });
  });
});
