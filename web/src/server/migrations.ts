// Forward-only, versioned schema. Each migration runs in a transaction and is recorded once.
// Auth tables (user, session, account, verification, organization, member, invitation) are created by better-auth first.
import { db, now } from "./db";

type Migration = { version: number; name: string } & ({ sql: string } | { apply: () => void });

const STUDIO_PRICE_MIGRATION = "listing asking price";
const SECURITY_MIGRATION = "security hardening: rate limits, workspace-scoped idempotency, consent ledger";
const ADD_ASKING_PRICE = "ALTER TABLE listing ADD COLUMN asking_price_cents INTEGER CHECK (asking_price_cents BETWEEN 1 AND 100000000)";
const ADD_STORY_SCRIPT = "ALTER TABLE project ADD COLUMN script TEXT NOT NULL DEFAULT ''";

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "core workspace, media, captions, rights, outputs, providers, audit",
    sql: `
CREATE TABLE workspace_pref (
  workspace_id TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  makes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(makes)),
  languages TEXT NOT NULL DEFAULT '["en"]' CHECK (json_valid(languages)),
  mixes_languages INTEGER NOT NULL DEFAULT 1 CHECK (mixes_languages IN (0,1)),
  device TEXT NOT NULL DEFAULT 'both' CHECK (device IN ('phone','laptop','both')),
  data_saver INTEGER NOT NULL DEFAULT 1 CHECK (data_saver IN (0,1)),
  glossary TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(glossary)),
  accuracy TEXT NOT NULL DEFAULT 'fast' CHECK (accuracy IN ('fast','accurate')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE project (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  kind TEXT NOT NULL CHECK (kind IN ('podcast','video','lesson','music','film','animation','client')),
  spoken_language TEXT NOT NULL DEFAULT 'auto',
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX project_by_ws ON project(workspace_id, updated_at DESC);

CREATE TABLE asset (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('source','proxy','audio','poster','peaks','render','caption','package')),
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  meta TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta)),
  created_at INTEGER NOT NULL
);
CREATE INDEX asset_by_project ON asset(project_id, kind);

CREATE TABLE job (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled','blocked')),
  input TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input)),
  output TEXT CHECK (output IS NULL OR json_valid(output)),
  error TEXT,
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key TEXT UNIQUE,
  depends_on TEXT REFERENCES job(id) ON DELETE SET NULL,
  run_after INTEGER NOT NULL,
  lease_until INTEGER,
  worker_id TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX job_queue ON job(status, run_after);
CREATE INDEX job_by_project ON job(project_id, created_at DESC);

CREATE TABLE caption_track (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('source','translation')),
  status TEXT NOT NULL CHECK (status IN ('draft','in_review','approved','revision_requested')),
  source_track_id TEXT REFERENCES caption_track(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (project_id, language, kind)
);

CREATE TABLE caption_line (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES caption_track(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL CHECK (end_ms > start_ms),
  text TEXT NOT NULL,
  words TEXT CHECK (words IS NULL OR json_valid(words)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  flag TEXT,
  approved_by TEXT,
  approved_at INTEGER,
  edited INTEGER NOT NULL DEFAULT 0,
  UNIQUE (track_id, idx)
);

CREATE TABLE clip (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  start_ms INTEGER NOT NULL CHECK (start_ms >= 0),
  end_ms INTEGER NOT NULL CHECK (end_ms > start_ms),
  reason TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('heuristic','model','manual')),
  status TEXT NOT NULL CHECK (status IN ('suggested','kept','dropped')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX clip_by_project ON clip(project_id, start_ms);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT NOT NULL,
  whole_recording INTEGER NOT NULL DEFAULT 1 CHECK (whole_recording IN (0,1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE appearance (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL CHECK (end_ms > start_ms)
);

CREATE TABLE consent (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES person(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('appearance','voice','likeness')),
  status TEXT NOT NULL CHECK (status IN ('requested','granted','declined','revoked')),
  statement TEXT NOT NULL,
  responded_name TEXT,
  responded_at INTEGER,
  user_agent TEXT,
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX consent_by_person ON consent(person_id, requested_at DESC);

CREATE TABLE declaration (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE share_link (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('review','consent')),
  target_id TEXT,
  label TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  opens INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE comment (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  link_id TEXT REFERENCES share_link(id) ON DELETE SET NULL,
  user_id TEXT,
  author TEXT NOT NULL,
  at_ms INTEGER,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','approve','changes')),
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX comment_by_project ON comment(project_id, created_at DESC);

CREATE TABLE output (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  clip_id TEXT REFERENCES clip(id) ON DELETE SET NULL,
  preset TEXT NOT NULL,
  language TEXT,
  burn INTEGER NOT NULL DEFAULT 1 CHECK (burn IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('queued','ready','failed','blocked')),
  note TEXT,
  job_id TEXT REFERENCES job(id) ON DELETE SET NULL,
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
  posted_platform TEXT,
  posted_url TEXT,
  posted_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE listing (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  clip_id TEXT NOT NULL REFERENCES clip(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  terms TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE enquiry (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listing(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  organisation TEXT,
  intended_use TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','replied','closed')),
  created_at INTEGER NOT NULL
);

CREATE TABLE provider (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compat','madlad_endpoint','asr_endpoint')),
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT,
  key_sealed TEXT,
  key_hint TEXT,
  roles TEXT NOT NULL DEFAULT '["plan","translate"]' CHECK (json_valid(roles)),
  last_test_at INTEGER,
  last_test_ok INTEGER,
  last_test_note TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE usage_event (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  job_id TEXT,
  unit TEXT NOT NULL,
  amount REAL NOT NULL,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE plan_run (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  planner TEXT NOT NULL,
  steps TEXT NOT NULL CHECK (json_valid(steps)),
  status TEXT NOT NULL CHECK (status IN ('proposed','approved','dismissed')),
  approved_by TEXT,
  approved_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE upload_session (
  upload_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE worker_beat (
  worker_id TEXT PRIMARY KEY,
  info TEXT NOT NULL CHECK (json_valid(info)),
  seen_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT,
  user_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT CHECK (meta IS NULL OR json_valid(meta)),
  created_at INTEGER NOT NULL
);
CREATE INDEX audit_by_ws ON audit_log(workspace_id, created_at DESC);
`,
  },
  {
    version: 2,
    name: SECURITY_MIGRATION,
    sql: `
CREATE TABLE rate_limit (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Idempotency keys are now stored with the workspace in front, so one tenant's key can never return another's job.
UPDATE job SET idempotency_key = workspace_id || ':' || idempotency_key
  WHERE idempotency_key IS NOT NULL AND substr(idempotency_key, 1, length(workspace_id) + 1) != workspace_id || ':';

-- Append-only, hash-chained record of every consent answer. Each row is signed with Ed25519.
CREATE TABLE consent_ledger (
  seq INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  consent_id TEXT NOT NULL,
  record TEXT NOT NULL CHECK (json_valid(record)),
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  sig TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX consent_ledger_by_consent ON consent_ledger(consent_id, seq);
CREATE TRIGGER consent_ledger_no_update BEFORE UPDATE ON consent_ledger BEGIN SELECT RAISE(ABORT, 'consent_ledger is append-only'); END;
CREATE TRIGGER consent_ledger_no_delete BEFORE DELETE ON consent_ledger BEGIN SELECT RAISE(ABORT, 'consent_ledger is append-only'); END;
`,
  },
  {
    version: 4,
    name: "reconcile security and studio migration histories",
    apply: reconcileStudioHistory,
  },
  {
    version: 5,
    name: "studio assistant budgets, threads, leases, line scans and job priority",
    sql: `
CREATE TABLE assistant_thread (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX assistant_thread_by_project ON assistant_thread(project_id, created_at DESC);

CREATE TABLE assistant_message (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES assistant_thread(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  text TEXT NOT NULL,
  provider_id TEXT,
  provider_label TEXT,
  model TEXT,
  privacy TEXT CHECK (privacy IS NULL OR privacy IN ('private','standard','may_log')),
  redacted INTEGER NOT NULL DEFAULT 0 CHECK (redacted >= 0),
  proposals TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(proposals)),
  outcome TEXT,
  request_id TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX assistant_message_by_thread ON assistant_message(thread_id, created_at);
CREATE INDEX assistant_message_retention ON assistant_message(created_at);

CREATE TABLE assistant_lease (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX assistant_lease_expiry ON assistant_lease(expires_at);

CREATE TABLE assistant_budget (
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  tokens_reserved INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cents_reserved INTEGER NOT NULL DEFAULT 0,
  cents_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, day)
);

CREATE TABLE line_injection_scan (
  line_id TEXT PRIMARY KEY REFERENCES caption_line(id) ON DELETE CASCADE,
  text_hash TEXT NOT NULL,
  model_rev TEXT NOT NULL,
  score REAL NOT NULL,
  status TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);

CREATE TABLE provider_v5 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compat','madlad_endpoint','asr_endpoint','openrouter','ollama','meta')),
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT,
  key_sealed TEXT,
  key_hint TEXT,
  roles TEXT NOT NULL DEFAULT '["plan","translate"]' CHECK (json_valid(roles)),
  last_test_at INTEGER,
  last_test_ok INTEGER,
  last_test_note TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO provider_v5 SELECT id, workspace_id, kind, label, base_url, model, key_sealed, key_hint, roles,
  last_test_at, last_test_ok, last_test_note, created_by, created_at FROM provider;
DROP TABLE provider;
ALTER TABLE provider_v5 RENAME TO provider;

ALTER TABLE job ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
CREATE INDEX job_queue_priority ON job(status, priority DESC, created_at);
`,
  },
  {
    version: 6,
    name: "single cross-process whisper lease",
    sql: `CREATE TABLE whisper_lease (id INTEGER PRIMARY KEY CHECK (id = 1), job_id TEXT NOT NULL, expires_at INTEGER NOT NULL);`,
  },
  {
    version: 7,
    name: "provider presets, owner free tier and task model routes",
    sql: `
CREATE TABLE provider_v7 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compat','madlad_endpoint','asr_endpoint','openrouter','groq','gemini','aimlapi','ollama','meta')),
  label TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT, key_sealed TEXT, key_hint TEXT,
  roles TEXT NOT NULL DEFAULT '["plan","translate"]' CHECK (json_valid(roles)),
  free_tier INTEGER NOT NULL DEFAULT 0 CHECK (free_tier IN (0,1)),
  last_test_at INTEGER, last_test_ok INTEGER, last_test_note TEXT, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
);
INSERT INTO provider_v7 (id,workspace_id,kind,label,base_url,model,key_sealed,key_hint,roles,last_test_at,last_test_ok,last_test_note,created_by,created_at)
SELECT id,workspace_id,kind,label,base_url,model,key_sealed,key_hint,roles,last_test_at,last_test_ok,last_test_note,created_by,created_at FROM provider;
DROP TABLE provider;
ALTER TABLE provider_v7 RENAME TO provider;
CREATE TABLE model_route (
  workspace_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('chat','plan','translate','clips')),
  provider_id TEXT NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 120),
  updated_by TEXT NOT NULL REFERENCES "user"(id), updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, role)
);
CREATE INDEX model_route_provider ON model_route(provider_id);
`,
  },
  {
    version: 8,
    name: "assistant reply records held-back transcript lines",
    sql: `ALTER TABLE assistant_message ADD COLUMN excluded_lines INTEGER NOT NULL DEFAULT 0 CHECK (excluded_lines >= 0);`,
  },
];

function reconcileStudioHistory() {
  const historical = db.prepare("SELECT name FROM schema_migrations WHERE version = 2").get() as { name: string } | undefined;
  if (historical?.name === STUDIO_PRICE_MIGRATION) {
    const security = MIGRATIONS.find((migration) => migration.name === SECURITY_MIGRATION);
    if (!security || !("sql" in security)) throw new Error("Missing security migration.");
    db.exec(security.sql);
  } else if (historical?.name !== SECURITY_MIGRATION) {
    throw new Error("Unrecognised app migration 2. Restore a known backup before upgrading.");
  }

  const hasColumn = (table: "listing" | "project", column: string) =>
    Boolean(db.prepare("SELECT 1 FROM pragma_table_info(?) WHERE name = ?").get(table, column));
  if (!hasColumn("listing", "asking_price_cents")) db.exec(ADD_ASKING_PRICE);
  if (!hasColumn("project", "script")) db.exec(ADD_STORY_SCRIPT);
}

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

function ensureTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
}

export function appliedVersion(): number {
  ensureTable();
  const r = db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations`).get() as { v: number };
  return r.v;
}

export function migrateApp(log: (s: string) => void = console.log) {
  ensureTable();
  for (const m of MIGRATIONS) {
    const applied = db.transaction(() => {
      if (m.version <= appliedVersion()) return false;
      if ("sql" in m) db.exec(m.sql);
      else m.apply();
      db.prepare(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`).run(m.version, m.name, now());
      return true;
    }).immediate();
    if (applied) log(`applied migration ${m.version}: ${m.name}`);
  }
}
