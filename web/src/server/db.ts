// SQLite in WAL mode: the web server and the worker share one file safely.
// Swap path: the same SQL runs on Postgres with small changes (see docs/lifecycle/DBLC.md).
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DB_FILE } from "./env";

export type Row = Record<string, unknown>;
type DB = Database.Database;
const g = globalThis as unknown as { __izwiDb?: DB; __izwiStmts?: Map<string, Database.Statement> };

function openDb(): DB {
  mkdirSync(dirname(DB_FILE), { recursive: true });
  const d = new Database(DB_FILE);
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  return d;
}

export const db: DB = (g.__izwiDb ??= openDb());
const stmts: Map<string, Database.Statement> = (g.__izwiStmts ??= new Map());

function stmt(sql: string) {
  let s = stmts.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmts.set(sql, s);
  }
  return s;
}

export const one = <T = Row>(sql: string, ...p: unknown[]) => stmt(sql).get(...p) as T | undefined;
export const all = <T = Row>(sql: string, ...p: unknown[]) => stmt(sql).all(...p) as T[];
export const run = (sql: string, ...p: unknown[]) => stmt(sql).run(...p);
export const tx = <T>(fn: () => T): T => db.transaction(fn)();
export const now = () => Date.now();
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 22)}`;

export function parse<T>(s: unknown, fallback: T): T {
  if (typeof s !== "string" || !s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
