-- Additive recovery store; existing draft IDs, versions and payloads are untouched.
CREATE TABLE IF NOT EXISTS editorial_originals (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
