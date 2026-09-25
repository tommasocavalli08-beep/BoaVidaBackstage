export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    password TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','pr')),
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, location TEXT NOT NULL, starts_at TEXT NOT NULL,
    closes_at TEXT, open INTEGER NOT NULL DEFAULT 0, list_price INTEGER NOT NULL DEFAULT 1500,
    table_price INTEGER NOT NULL DEFAULT 2500, list_cap INTEGER NOT NULL DEFAULT 300,
    table_cap INTEGER NOT NULL DEFAULT 120, max_tables INTEGER NOT NULL DEFAULT 12,
    default_table_cap INTEGER NOT NULL DEFAULT 10, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id),
    owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL CHECK(kind IN ('pista','tavolo')),
    name TEXT NOT NULL, capacity INTEGER NOT NULL, price INTEGER, token TEXT NOT NULL UNIQUE,
    open INTEGER NOT NULL DEFAULT 1, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lists_event_owner ON lists(event_id,owner_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pista_per_pr ON lists(event_id,owner_id) WHERE kind='pista'`,
  `CREATE TABLE IF NOT EXISTS guests (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id),
    list_id TEXT NOT NULL REFERENCES lists(id), first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    name_key TEXT NOT NULL, checked_at TEXT, paid INTEGER NOT NULL DEFAULT 0,
    request_id TEXT UNIQUE, created_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_event_name ON guests(event_id,name_key)`,
  `CREATE INDEX IF NOT EXISTS idx_guests_list ON guests(list_id)`,
  `CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), actor_id TEXT,
    owner_id TEXT, message TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_activity_event_created ON activity(event_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until BIGINT NOT NULL)`,
];
