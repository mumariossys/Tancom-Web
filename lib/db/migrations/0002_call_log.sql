-- Call log for outbound Twilio phone calls (idempotent).
CREATE TABLE IF NOT EXISTS call_log (
  id               serial PRIMARY KEY,
  owner_clerk_id   text NOT NULL,
  contact_id       integer,
  phone_number     text NOT NULL,
  call_sid         text NOT NULL,
  duration_seconds integer,
  status           text NOT NULL DEFAULT 'initiated',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_log_call_sid_unique'
  ) THEN
    ALTER TABLE call_log ADD CONSTRAINT call_log_call_sid_unique UNIQUE (call_sid);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS call_log_owner_created_at_idx
  ON call_log (owner_clerk_id, created_at DESC);
