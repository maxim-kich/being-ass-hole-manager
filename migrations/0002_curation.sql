ALTER TABLE assessments ADD COLUMN featured_at TEXT;
CREATE INDEX assessments_featured ON assessments(featured_at DESC) WHERE featured_at IS NOT NULL;
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
