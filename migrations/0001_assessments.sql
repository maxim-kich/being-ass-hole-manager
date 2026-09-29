CREATE TABLE assessments (
  id TEXT PRIMARY KEY NOT NULL,
  story TEXT NOT NULL,
  model_response TEXT,
  created_at TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  schema_version INTEGER NOT NULL DEFAULT 1
);
