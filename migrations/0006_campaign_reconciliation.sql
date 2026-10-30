ALTER TABLE campaign_send_attempts ADD COLUMN provider_status TEXT;
ALTER TABLE campaign_send_attempts ADD COLUMN observed_at TEXT;
ALTER TABLE campaign_send_attempts ADD COLUMN publication_hash TEXT;
