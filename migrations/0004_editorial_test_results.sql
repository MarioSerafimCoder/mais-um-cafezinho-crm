-- Preserve every historical attempt, including uncertain legacy outcomes.
DROP INDEX IF EXISTS editorial_test_revision;
CREATE INDEX IF NOT EXISTS editorial_test_history ON editorial_tests(draft_id, created_at);
CREATE INDEX IF NOT EXISTS editorial_test_pending ON editorial_tests(campaign_id, recipient, state);
ALTER TABLE editorial_tests ADD COLUMN provider_status INTEGER;
ALTER TABLE editorial_tests ADD COLUMN completed_at TEXT;
