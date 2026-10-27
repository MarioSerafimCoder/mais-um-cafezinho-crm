CREATE TABLE IF NOT EXISTS editorial_documents (
  kind TEXT NOT NULL CHECK (kind IN ('draft', 'settings')),
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
