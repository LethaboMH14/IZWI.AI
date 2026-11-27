// Postgres: Supabase when hosted (DATABASE_URL), in-process PGlite for tests (IZWI_DB=pglite).
// SQL keeps `?` placeholders; they are rewritten to $1, $2 … once per statement string.
// tx(fn) runs fn on one connection between BEGIN and COMMIT. Queries made inside fn, even from nested helpers,
// join that transaction through AsyncLocalStorage.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pg from "pg";

export type Row = Record<string, unknown>;
type Result = { rows: Row[]; rowCount: number };
type Exec = (sql: string, params: unknown[]) => Promise<Result>;
// A transaction-bound handle: run one statement, or a parameterless multi-statement script.
type Handle = { exec: Exec; script: (sql: string) => Promise<void> };
type Driver = Handle & { tx: <T>(fn: (h: Handle) => Promise<T>) => Promise<T>; close: () => Promise<void> };

// int8 (counts, millisecond timestamps) and numeric (SUM over int8) come back as strings by default.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

function pgDriver(url: string): Driver {
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.IZWI_DB_POOL_MAX || 5), idleTimeoutMillis: 10_000 });
  const exec: Exec = async (sql, params) => {
    const r = await pool.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount ?? 0 };
  };
  return {
    exec,
    script: async (sql) => void (await pool.query(sql)),
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const out = await fn({
          exec: async (sql, params) => {
            const r = await c.query(sql, params);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
          script: async (sql) => void (await c.query(sql)),
        });
        await c.query("COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

async function pgliteDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const lite = await PGlite.create({ dataDir: process.env.IZWI_PGLITE_DIR || undefined, parsers: { 20: Number, 1700: Number } });
  const wrap = (q: { query: (s: string, p: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> }): Exec => async (sql, params) => {
    const r = await q.query(sql, params);
    return { rows: r.rows as Row[], rowCount: r.affectedRows ?? r.rows.length };
  };
  const toNum = (r: Result) => {
    for (const row of r.rows) for (const k in row) if (typeof row[k] === "bigint") row[k] = Number(row[k]);
    return r;
  };
  const base = wrap(lite);
  return {
    exec: async (s, p) => toNum(await base(s, p)),
    script: async (sql) => void (await lite.exec(sql)),
    tx: (fn) => lite.transaction(async (t) => {
      const e = wrap(t);
      return fn({ exec: async (s, p) => toNum(await e(s, p)), script: async (sql) => void (await t.exec(sql)) });
    }),
    close: () => lite.close(),
  };
}

const g = globalThis as unknown as { __izwiDriver?: Promise<Driver>; __izwiSql?: Map<string, string> };

function driver(): Promise<Driver> {
  if (!g.__izwiDriver) {
    if (process.env.IZWI_DB === "pglite") g.__izwiDriver = pgliteDriver();
    else {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set. See docs/engineering/DEPLOY.md.");
      g.__izwiDriver = Promise.resolve(pgDriver(url));
    }
  }
  return g.__izwiDriver;
}

const sqlCache: Map<string, string> = (g.__izwiSql ??= new Map());

// `?` → `$n`, skipping string literals, quoted identifiers and comments.
export function toPg(sql: string): string {
  const hit = sqlCache.get(sql);
  if (hit) return hit;
  let out = "";
  let n = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      const stop = end < 0 ? sql.length : end;
      out += sql.slice(i, stop + 1);
      i = stop;
    } else if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const stop = end < 0 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop - 1;
    } else if (c === "?") out += `$${++n}`;
    else out += c;
  }
  sqlCache.set(sql, out);
  return out;
}

const txStore = new AsyncLocalStorage<Handle>();

// SQLite-style named parameters ($id, @id) with one plain-object argument become positional $n.
const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;

export function namedToPg(sql: string, values: Record<string, unknown>): { text: string; params: unknown[] } {
  const order: string[] = [];
  let out = "";
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      const end = sql.indexOf(c, i + 1);
      const stop = end < 0 ? sql.length : end;
      out += sql.slice(i, stop + 1);
      i = stop;
      continue;
    }
    const m = (c === "$" || c === "@") ? /^[A-Za-z_]\w*/.exec(sql.slice(i + 1)) : null;
    if (m) {
      if (!(m[0] in values)) throw new Error(`Missing named parameter ${c}${m[0]}`);
      let k = order.indexOf(m[0]);
      if (k < 0) k = order.push(m[0]) - 1;
      out += `$${k + 1}`;
      i += m[0].length;
    } else out += c;
  }
  return { text: out, params: order.map((k) => values[k]) };
}

async function q(sql: string, params: unknown[]): Promise<Result> {
  let text: string;
  if (params.length === 1 && isPlain(params[0])) {
    const n = namedToPg(sql, params[0]);
    text = n.text;
    params = n.params;
  } else text = toPg(sql);
  const inTx = txStore.getStore();
  // pg sends JS booleans and undefined awkwardly; the schema stores flags as 0/1.
  const p = params.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  return (inTx ?? (await driver())).exec(text, p);
}

export const one = async <T = Row>(sql: string, ...p: unknown[]) => (await q(sql, p)).rows[0] as T | undefined;
export const all = async <T = Row>(sql: string, ...p: unknown[]) => (await q(sql, p)).rows as T[];
export const run = async (sql: string, ...p: unknown[]) => ({ changes: (await q(sql, p)).rowCount });
// Multi-statement DDL with no parameters (migrations).
export async function execScript(sql: string) {
  await (txStore.getStore() ?? (await driver())).script(sql);
}

export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn(); // already inside one: join it
  return (await driver()).tx((h) => txStore.run(h, fn));
}

// Serialises concurrent writers on one key for the rest of the current transaction (consent chain, migrations).
export async function lockKey(key: string) {
  await q(`SELECT pg_advisory_xact_lock(hashtext(?))`, [key]);
}

export async function closeDb() {
  const d = g.__izwiDriver;
  g.__izwiDriver = undefined;
  if (d) await (await d).close();
}

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
