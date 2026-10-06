-- Altus Aerials D1 schema (paste into D1 → altus-db → Console, or run: wrangler d1 execute altus-db --file=schema.sql)
CREATE TABLE IF NOT EXISTS galleries (
  slug TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  city_line TEXT,
  package TEXT,
  shoot_date TEXT,
  agent_name TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  flightpath_id TEXT,
  prefix TEXT NOT NULL,
  data TEXT NOT NULL,
  pass_salt TEXT,
  pass_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  event TEXT NOT NULL,
  photo TEXT,
  visitor TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_slug ON events (slug, event);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  name TEXT, phone TEXT, email TEXT,
  address TEXT, city TEXT,
  package TEXT, date TEXT, time_window TEXT, notes TEXT,
  from_slug TEXT,
  status TEXT DEFAULT 'requested',
  flightpath_id TEXT
);
