-- Phase 2 contact features (idempotent).
-- contacts: category + labels
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}';

-- user_profiles: unique username + presence timestamp
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Defensively null out any duplicate usernames before adding the unique
-- constraint (keeps the earliest row's username; NULLs never collide).
UPDATE user_profiles up
SET username = NULL
WHERE username IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM user_profiles other
    WHERE other.username = up.username AND other.id < up.id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_username_unique'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_username_unique UNIQUE (username);
  END IF;
END $$;

-- chat_participants: per-participant archived flag
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
