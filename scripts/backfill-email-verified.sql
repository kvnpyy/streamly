-- One-time after enabling email verification: grandfather existing Streamly users.
-- Adjust the database path; default relative to repo: data/stream.db
--
--   sqlite3 data/stream.db < scripts/backfill-email-verified.sql
--
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;
