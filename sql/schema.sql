CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  label TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS log_channels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  thread_id BIGINT,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, thread_id)
);

ALTER TABLE log_channels DROP COLUMN IF EXISTS is_primary;
ALTER TABLE log_channels ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
DROP INDEX IF EXISTS log_channels_single_primary_idx;

CREATE TABLE IF NOT EXISTS number_channels (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  thread_id BIGINT,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, thread_id)
);

ALTER TABLE number_channels ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';
ALTER TABLE number_channels ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE number_channels ADD COLUMN IF NOT EXISTS link_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS otp_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE RESTRICT,
  fingerprint TEXT NOT NULL,
  number TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  range_name TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS otp_logs_api_key_id_received_at_idx
  ON otp_logs (api_key_id, received_at DESC);
