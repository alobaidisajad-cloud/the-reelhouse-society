-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 7 · #80 — make a ban mean something, and make SUSPENSION exist at all
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ NO APP CHANGE. Nothing here needs a new build.
--
-- ── THE BIGGEST THING HERE IS NOT IN #80 AT ALL ──────────────────────────────
-- The Tribunal (app/(admin)/tribunal.tsx) offers four punishments. Read live from
-- resolve_moderation_report_v2, which is what actually writes them:
--
--     warn             -> warning_count + 1          informational, fine
--     suspend          -> suspended_until = <expiry>  ENFORCED NOWHERE
--     ban              -> is_banned = true            enforced on 10 tables, INSERT only
--     permanent_exile  -> is_banned = true            same
--     mute_user        -> suspended_until = <expiry>  ENFORCED NOWHERE
--
-- The live body of is_user_not_banned() is, verbatim:
--     RETURN NOT EXISTS (
--       SELECT 1 FROM profiles WHERE id = auth.uid() AND is_banned = true)
-- It does not look at suspended_until. Nothing does.
--
-- So "SUSPEND MEMBER — Temporarily restrict access for the specified duration" and
-- "Mute" are inert. A moderator issues a 24-hour suspension, the Tribunal confirms
-- it, mod_actions records it, and the member keeps posting for the full 24 hours.
-- Same class as batch 3's "Delete Account" — the app states an outcome that does
-- not happen. Two of the Tribunal's five outcomes currently do nothing.
--
-- Fixing it is one function. Widening is_user_not_banned() makes every one of the
-- ten existing policies enforce suspension immediately, with no policy changes.
--
-- ── WHAT #80 GETS WRONG, AND WHAT IT UNDERSTATES ────────────────────────────
-- FALSE POSITIVE: it says useBanCheck has "zero call sites" and is dead code.
-- app/(modals)/list-modal.tsx:37,139,240 imports and calls it, added by commit
-- f6b7b91 AFTER the audit. It is wired at 1 of ~6 choke points — a smaller and
-- different job than the finding describes. NOT addressed here (client change).
--
-- UNDERSTATED: it names 2 uncovered tables. A live read of all 27 tables both apps
-- write to found:
--     ban gate on INSERT   10 tables
--     ban gate on UPDATE    2 tables — logs and dispatch_dossiers ONLY
--     no ban gate at all   17 tables
--
-- NEVER RAISED: editing. Outside those two tables a ban stops new posts and nothing
-- else, so a banned member can rewrite an existing list, comment, programme or
-- their own PROFILE into abuse — same visible harm the finding cites for reactions.
-- profiles is the worst of these and is not in the finding.
--
-- ── MECHANISM: triggers, not policies. Third batch running. ─────────────────
-- SECURITY DEFINER bypasses RLS. Known DEFINER writers: toggle_dossier_certify
-- (certifications), six functions on lounge_members, four on lounges including the
-- member counter, three on profiles including the one that SETS the ban, and
-- replace_list_items on list_items.
--
-- ⚠️ That list is NOT trusted to be complete. replace_list_items declares
-- `LANGUAGE plpgsql SECURITY DEFINER` AFTER its body, so a scan looking for the
-- marker before the INSERT misses it. Rather than refine the scan, every content
-- table gets a trigger. Completeness by construction, not by my audit being
-- exhaustive — the same correction batch 6 arrived at.
--
-- ── WHAT DELIBERATELY STAYS OPEN ───────────────────────────────────────────
--   user_blocks              blocking is self-protection; it must not stop
--   reports, user_reports    reporting abuse and appealing are exactly what a
--                            silenced member needs most
--   analytics_events, error_logs   telemetry; gating it blinds the app to their crashes
--   notifications, push_tokens     system-owned, nothing another member sees
--   log_private_notes        owner-only by construction (batch 1); nobody can read it
--   tickets                  a purchase, not content — a billing decision, not moderation
--   DELETE, everywhere       a silenced member must be able to remove their own
--                            writing and leave. Trapping them with content they want
--                            gone is worse for them and worse for the Society.
--
-- ── TWO TRAPS FOUND WHILE DESIGNING ────────────────────────────────────────
-- A blanket UPDATE gate on `lounges` would break LEAVING a lounge:
-- recount_lounge_members fires on every membership change and updates
-- lounges.member_count. The leave would fail on the counter, not on any rule about
-- the member. Solved by reverting only name/description/cover_image/is_private —
-- a counter update touches none of them.
--
-- A blanket UPDATE gate on `profiles` would block harmless self-config, because
-- `preferences` lives on profiles and RLS cannot gate a column. Solved by the same
-- field-revert pattern batch 6 used. It also had to be confirmed that
-- resolve_moderation_report_v2 (which SETS the ban) still works: it does, because
-- the gate reads auth.uid() — the moderator — not the target.
--
-- lounge_messages UPDATE is deliberately NOT gated: the only path is
-- withdraw_lounge_message, a member REMOVING their own words.
-- lounge_members UPDATE is deliberately NOT gated: the host approving a pending
-- member must keep working.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1 · make suspension real, everywhere, in one change ─────────────────────
--
-- The name is kept because ten existing RESTRICTIVE policies reference it by name;
-- renaming would mean rewriting all ten. Its meaning is now "not restricted" —
-- banned OR serving an unexpired suspension.
--
-- STABLE is still correct: now() is stable within a transaction.
CREATE OR REPLACE FUNCTION public.is_user_not_banned()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND (is_banned = true
            OR (suspended_until IS NOT NULL AND suspended_until > now()))
  );
$$;

COMMENT ON FUNCTION public.is_user_not_banned() IS
  'TRUE when the caller may write. FALSE if banned OR serving an unexpired '
  'suspension. Named for the ten policies that reference it; the meaning is '
  '"not restricted". Widening this made Tribunal suspend/mute enforceable at all.';

-- ── 2 · one gate, and it tells the member which punishment and for how long ──
CREATE OR REPLACE FUNCTION public.enforce_not_restricted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_banned boolean;
  v_until  timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;                       -- service_role / system paths untouched
  END IF;

  SELECT is_banned, suspended_until
    INTO v_banned, v_until
    FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_banned, false) THEN
    RAISE EXCEPTION 'Your account has been silenced by The Society.'
      USING ERRCODE = '42501';
  END IF;

  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'Your account is suspended until %.',
      to_char(v_until AT TIME ZONE 'UTC', 'DD Mon YYYY HH24:MI "UTC"')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

-- ── 3 · gate creation on every table another member can see ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'logs','lists','list_items','list_comments','log_comments','watchlists',
    'interactions','dispatch_dossiers','dossier_comments','lounge_messages',
    'dossier_certifications','lounge_message_reactions','physical_archive',
    'lounges','lounge_members','programmes','vaults'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c
                WHERE c.relname = t AND c.relnamespace = 'public'::regnamespace) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_ban_gate_insert ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER tr_ban_gate_insert BEFORE INSERT ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted()', t);
    END IF;
  END LOOP;
END $$;

-- ── 4 · gate EDITING where an edit can become abuse ─────────────────────────
-- lounge_messages, lounge_members, lounges and profiles are deliberately absent —
-- see the trap notes in the header. logs and dispatch_dossiers already have a
-- RESTRICTIVE ban policy on UPDATE, and now inherit suspension from §1 too; the
-- trigger is added anyway so a SECURITY DEFINER edit path cannot slip past.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'logs','lists','list_items','list_comments','log_comments','dossier_comments',
    'dispatch_dossiers','physical_archive','programmes','vaults'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_class c
                WHERE c.relname = t AND c.relnamespace = 'public'::regnamespace) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_ban_gate_update ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER tr_ban_gate_update BEFORE UPDATE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.enforce_not_restricted()', t);
    END IF;
  END LOOP;
END $$;

-- ── 5 · profiles — nobody edits their own moderation record, ever ───────────
--
-- ⚠️ THIS SECTION CAUGHT A HOLE IN AN EARLIER DRAFT OF THIS MIGRATION.
-- The first version reverted only the public identity fields. Tested on a replica,
-- a banned member simply did
--     UPDATE profiles SET is_banned = false WHERE id = <self>
-- and walked free. The whole ban system was one PATCH away from meaningless.
--
-- In production a column grant from 20260717_01 restricts `authenticated` to
-- UPDATE (username, bio, avatar_url, display_name, persona, social_links,
-- is_social_private), which would block that. **This does not rely on it.** A
-- grant is one migration away from being widened by someone who does not know it
-- is load-bearing; the ban system must not depend on that.
--
-- So there are now two rules, in order:
--   1. On ANY self-update, the moderation record is reverted. Not just for
--      restricted members — nobody clears their own warning count either.
--   2. If the member IS restricted, the public identity is reverted too.
--
-- A moderator is untouched: the whole function returns early when
-- auth.uid() <> NEW.id, so resolve_moderation_report_v2 — which updates the
-- TARGET's row — passes straight through. Verified on a replica.
CREATE OR REPLACE FUNCTION public.enforce_profile_identity_freeze()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_banned boolean;
  v_until  timestamptz;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;    -- moderator action (resolve_moderation_report_v2) and system paths
  END IF;

  -- 1 · moderation state is never self-editable, restricted or not
  NEW.is_banned         := OLD.is_banned;
  NEW.banned_at         := OLD.banned_at;
  NEW.suspended_until   := OLD.suspended_until;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.warning_count     := OLD.warning_count;

  -- 2 · a restricted member also loses control of what the Society sees.
  -- is_social_private is deliberately NOT frozen: choosing to go private is a
  -- privacy decision that stays theirs even while silenced.
  SELECT is_banned, suspended_until INTO v_banned, v_until
    FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_banned, false)
     OR (v_until IS NOT NULL AND v_until > now()) THEN
    NEW.username     := OLD.username;
    NEW.display_name := OLD.display_name;
    NEW.bio          := OLD.bio;
    NEW.avatar_url   := OLD.avatar_url;
    NEW.social_links := OLD.social_links;
    NEW.persona      := OLD.persona;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_ban_freeze_profile_identity ON public.profiles;
CREATE TRIGGER tr_ban_freeze_profile_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_identity_freeze();

-- ── 6 · lounges — revert the room's public face, let the counter through ────
CREATE OR REPLACE FUNCTION public.enforce_lounge_identity_freeze()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_banned boolean;
  v_until  timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_banned, suspended_until INTO v_banned, v_until
    FROM public.profiles WHERE id = auth.uid();

  IF COALESCE(v_banned, false)
     OR (v_until IS NOT NULL AND v_until > now()) THEN
    -- member_count is untouched, so recount_lounge_members still works and a
    -- restricted member can still LEAVE a lounge.
    NEW.name        := OLD.name;
    NEW.description := OLD.description;
    NEW.cover_image := OLD.cover_image;
    NEW.is_private  := OLD.is_private;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_ban_freeze_lounge_identity ON public.lounges;
CREATE TRIGGER tr_ban_freeze_lounge_identity
  BEFORE UPDATE ON public.lounges
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lounge_identity_freeze();

COMMIT;

-- ── Verify (run after) ─────────────────────────────────────────────────────
-- Nobody is banned or suspended today (live: 0 and 0), so use a throwaway account
-- and a rolled-back transaction.
--
--   BEGIN;
--     UPDATE profiles SET is_banned = true WHERE id = '<test>';
--     SELECT set_config('request.jwt.claims','{"sub":"<test>","role":"authenticated"}',true);
--     SET LOCAL ROLE authenticated;
--     -- every one of these must RAISE:
--     INSERT INTO logs(...); INSERT INTO physical_archive(...);
--     INSERT INTO dossier_certifications(...); INSERT INTO lounge_message_reactions(...);
--     UPDATE lists SET title = 'abuse' WHERE user_id = '<test>';
--     -- these must STILL WORK:
--     INSERT INTO user_blocks(...);        -- self-protection
--     INSERT INTO reports(...);            -- reporting / appeal
--     DELETE FROM logs WHERE user_id = '<test>';   -- removing own writing
--     DELETE FROM lounge_members WHERE user_id = '<test>';  -- leaving a room
--     -- identity frozen but settings free:
--     UPDATE profiles SET username = 'abuse' WHERE id = '<test>';  -- username unchanged
--     UPDATE profiles SET preferences = '{"notif_system":false}' WHERE id = '<test>';  -- applies
--   ROLLBACK;
--
--   And the same for a SUSPENSION (suspended_until = now() + interval '1 hour'),
--   which before this migration restricted nothing at all.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- DO $$ DECLARE t text; BEGIN
--   FOREACH t IN ARRAY ARRAY['logs','lists','list_items','list_comments',
--     'log_comments','watchlists','interactions','dispatch_dossiers',
--     'dossier_comments','lounge_messages','dossier_certifications',
--     'lounge_message_reactions','physical_archive','lounges','lounge_members',
--     'programmes','vaults'] LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS tr_ban_gate_insert ON public.%I', t);
--     EXECUTE format('DROP TRIGGER IF EXISTS tr_ban_gate_update ON public.%I', t);
--   END LOOP; END $$;
-- DROP TRIGGER IF EXISTS tr_ban_freeze_profile_identity ON public.profiles;
-- DROP TRIGGER IF EXISTS tr_ban_freeze_lounge_identity  ON public.lounges;
-- DROP FUNCTION IF EXISTS public.enforce_not_restricted();
-- DROP FUNCTION IF EXISTS public.enforce_profile_identity_freeze();
-- DROP FUNCTION IF EXISTS public.enforce_lounge_identity_freeze();
-- CREATE OR REPLACE FUNCTION public.is_user_not_banned() RETURNS boolean
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT NOT EXISTS (SELECT 1 FROM public.profiles
--                       WHERE id = auth.uid() AND is_banned = true); $$;
--
-- ── NOT DONE HERE ──────────────────────────────────────────────────────────
-- The client half: checkBan() is wired in list-modal only. Adding it to the other
-- ~5 choke points turns a generic failure into an honest message. Cosmetic once
-- this migration lands — the server refuses regardless — and it is a client change,
-- so it belongs to the launch build. Recorded, not bundled.
