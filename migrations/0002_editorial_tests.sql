CREATE TABLE IF NOT EXISTS editorial_tests (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  cloud_revision INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  body TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'prepared'
);
CREATE UNIQUE INDEX IF NOT EXISTS editorial_test_revision ON editorial_tests(draft_id, cloud_revision, recipient);
