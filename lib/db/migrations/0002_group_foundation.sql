-- Group foundation upgrades (idempotent).
-- Prerequisite: base schema must exist (created by `pnpm --filter @workspace/db run push`
-- or a prior provisioning step). On a fresh database run `push` first, then `migrate`.
-- Every statement is guarded so the migration is safe regardless of prior state.

-- ── groups ─────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE groups ADD COLUMN IF NOT EXISTS description text;
  ALTER TABLE groups ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false;
  ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_token_expires_at timestamptz;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── group_members ─────────────────────────────────────────────────────────────
-- memberRole is a text column so 'owner' is valid without schema change.
DO $$ BEGIN
  ALTER TABLE group_members ADD COLUMN IF NOT EXISTS can_add_members boolean NOT NULL DEFAULT false;
  ALTER TABLE group_members ADD COLUMN IF NOT EXISTS can_edit_group_info boolean NOT NULL DEFAULT false;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── group_posts ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE group_posts ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── meetings ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE meetings ADD COLUMN IF NOT EXISTS group_id integer
    REFERENCES groups(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN NULL;
         WHEN undefined_column THEN NULL; END $$;

-- ── group_join_requests ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS group_join_requests (
    id                   serial PRIMARY KEY,
    group_id             integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    requester_clerk_id   text NOT NULL,
    requester_name       text NOT NULL,
    requester_email      text NOT NULL,
    status               text NOT NULL DEFAULT 'pending',
    requested_at         timestamptz NOT NULL DEFAULT now(),
    reviewed_at          timestamptz,
    reviewed_by_clerk_id text
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS group_join_requests_group_id_idx
    ON group_join_requests(group_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS group_join_requests_requester_idx
    ON group_join_requests(requester_clerk_id);
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── group_mutes ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS group_mutes (
    clerk_id  text    NOT NULL,
    group_id  integer NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    muted_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (clerk_id, group_id)
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Deduplicate legacy member rows before enforcing uniqueness ────────────────
-- Keep the earliest row (lowest id) for each (group_id, invited_clerk_id) pair.
-- Safe to run on an empty table or a table where no duplicates exist.
DO $$ BEGIN
  DELETE FROM group_members gm
  WHERE invited_clerk_id IS NOT NULL
    AND gm.id NOT IN (
      SELECT MIN(id)
      FROM group_members
      WHERE invited_clerk_id IS NOT NULL
      GROUP BY group_id, invited_clerk_id
    );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Unique membership index ───────────────────────────────────────────────────
-- One row per (group, invited user); partial on non-null invited_clerk_id.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS group_members_unique_invited
    ON group_members(group_id, invited_clerk_id)
    WHERE invited_clerk_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ── Backfill owner member rows ────────────────────────────────────────────────
-- Creates an explicit owner row for every existing group that lacks one,
-- so the owner appears in member lists and is included in group meeting invites.
DO $$ BEGIN
  INSERT INTO group_members (
    group_id, name, email, added_at,
    invited_clerk_id, invitation_status,
    member_role, can_post, can_delete_any_post,
    can_add_members, can_edit_group_info
  )
  SELECT
    g.id,
    COALESCE(up.name, 'Group Owner'),
    COALESCE(up.email, ''),
    g.created_at,
    g.owner_clerk_id,
    'accepted',
    'owner',
    true,
    true,
    true,
    true
  FROM groups g
  LEFT JOIN user_profiles up ON up.clerk_id = g.owner_clerk_id
  WHERE NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g.id
      AND gm.invited_clerk_id = g.owner_clerk_id
  );
EXCEPTION WHEN undefined_table THEN NULL; END $$;
