-- ═══════════════════════════════════════════════════════════════════════════════
-- LOUNGE — restore `profiles` embeds (fixes the build-31 400 Bad Request storm)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Root cause (Sentry, build 31): lounge_messages / lounge_members /
-- lounge_message_reactions carry a `user_id uuid` column but had NO foreign key to
-- public.profiles. PostgREST can only resolve `profiles!..._user_id_fkey(...)` /
-- `profiles(...)` embeds when a FK relationship to profiles exists — with none, every
-- such select returned 400, breaking Lounge chat + roster entirely.
--
-- Fix: declare the missing FKs to public.profiles(id) with the exact constraint names
-- the client hints, then reload the PostgREST schema cache. profiles.id is 1:1 with
-- auth.users.id, so a FK to profiles transitively preserves auth integrity.
--
-- Added NOT VALID → immediately usable for embedding (PostgREST detects relationships
-- from pg_constraint regardless of validity) and non-destructive on any legacy rows.
-- We then attempt VALIDATE per-constraint, swallowing failures so orphaned legacy data
-- can never abort the migration.
--
-- Idempotent. Single transaction. Safe to run via `supabase db push` or the SQL editor.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── lounge_messages.user_id → profiles.id ────────────────────────────────────
ALTER TABLE public.lounge_messages DROP CONSTRAINT IF EXISTS lounge_messages_user_id_fkey;
ALTER TABLE public.lounge_messages
  ADD CONSTRAINT lounge_messages_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

-- ── lounge_members.user_id → profiles.id ─────────────────────────────────────
ALTER TABLE public.lounge_members DROP CONSTRAINT IF EXISTS lounge_members_user_id_fkey;
ALTER TABLE public.lounge_members
  ADD CONSTRAINT lounge_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

-- ── lounge_message_reactions.user_id → profiles.id ───────────────────────────
ALTER TABLE public.lounge_message_reactions DROP CONSTRAINT IF EXISTS lounge_message_reactions_user_id_fkey;
ALTER TABLE public.lounge_message_reactions
  ADD CONSTRAINT lounge_message_reactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE NOT VALID;

-- ── Best-effort validation (never aborts on legacy orphans) ──────────────────
DO $$
BEGIN
  BEGIN ALTER TABLE public.lounge_messages          VALIDATE CONSTRAINT lounge_messages_user_id_fkey;
  EXCEPTION WHEN others THEN RAISE NOTICE 'lounge_messages FK left NOT VALID: %', SQLERRM; END;

  BEGIN ALTER TABLE public.lounge_members           VALIDATE CONSTRAINT lounge_members_user_id_fkey;
  EXCEPTION WHEN others THEN RAISE NOTICE 'lounge_members FK left NOT VALID: %', SQLERRM; END;

  BEGIN ALTER TABLE public.lounge_message_reactions VALIDATE CONSTRAINT lounge_message_reactions_user_id_fkey;
  EXCEPTION WHEN others THEN RAISE NOTICE 'lounge_message_reactions FK left NOT VALID: %', SQLERRM; END;
END $$;

-- ── Reload PostgREST schema cache so embeds resolve immediately ──────────────
NOTIFY pgrst, 'reload schema';

COMMIT;
