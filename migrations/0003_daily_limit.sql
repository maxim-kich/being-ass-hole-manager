CREATE TABLE assessment_daily_usage (
  day TEXT PRIMARY KEY NOT NULL,
  used INTEGER NOT NULL CHECK (used >= 0)
);
-- statement-break
INSERT INTO assessment_daily_usage (day, used)
SELECT substr(created_at, 1, 10), count(*) FROM assessments GROUP BY substr(created_at, 1, 10);
-- statement-break
-- Atomic admission: duplicates do not consume slots; provider failures retain theirs.
CREATE TRIGGER assessment_daily_admission AFTER INSERT ON assessments
BEGIN
  SELECT RAISE(ABORT, 'DAILY_ASSESSMENT_LIMIT')
  WHERE COALESCE((SELECT used FROM assessment_daily_usage WHERE day = substr(NEW.created_at, 1, 10)), 0) >= 7000;
  INSERT INTO assessment_daily_usage (day, used) VALUES (substr(NEW.created_at, 1, 10), 1)
  ON CONFLICT(day) DO UPDATE SET used = used + 1;
END;
