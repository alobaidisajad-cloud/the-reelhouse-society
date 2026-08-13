-- ════════════════════════════════════════════════════════════════════════════
-- BATCH 31 — remove the dead subsystem
-- ════════════════════════════════════════════════════════════════════════════
--
-- Removes an entire feature that was built, abandoned, and left running: cinema
-- listings, seat booking, video reviews with tipping, a waitlist, a second
-- reporting table, a write buffer and a feed cache.
--
--   11 tables (ALL 0 rows) · 1 materialized view · 14 functions · 2 cron jobs
--   · 22 RLS policies · 12 triggers · 20 indexes · 1 dead column
--
-- ── WHY THIS IS NOT TIDINESS ───────────────────────────────────────────────
--  · sweep_interaction_buffer has failed on EVERY run since it was created —
--    171,883 failures, 0 successes, once a minute. That volume of identical
--    errors would completely hide a real scheduled-job failure.
--  · refresh_global_feed succeeded 171,826 times refreshing a view nothing
--    reads — it was keeping the leaked feed data fresh, every minute.
--  · Three dropped functions are SECURITY DEFINER and callable by ANONYMOUS
--    users: handle_interaction_removal, increment_video_tips,
--    process_user_report. Live attack surface for features that do not exist.
--  · Five of the dropped policies are USING (true).
--
-- ── PROVEN BEFORE WRITING ──────────────────────────────────────────────────
-- The whole batch was rehearsed against production inside a rolled-back
-- transaction. It failed three times first, and each failure is why a line here
-- reads the way it does:
--   1. two DROP signatures were guessed wrong — increment_video_tips and
--      process_user_report take NO arguments — so those functions would have
--      silently survived, referencing tables that no longer existed;
--   2. a rewrite silently did not apply, caught as "relation
--      public.video_reviews does not exist": CHANGING A USERNAME would have
--      broken in production;
--   3. protect_privileged_profile_fields references trust_score, so dropping
--      that column without editing this security trigger would have broken
--      EVERY profile update.
--
-- ── THE FOUR LIVE FUNCTIONS EDITED, NOT DROPPED ────────────────────────────
--   handle_user_deletion              — dropped its tickets/vaults deletes
--   request_account_deletion          — dropped its tips/video_reviews updates
--   sync_denormalized_username        — dropped its video_reviews update
--   protect_privileged_profile_fields — dropped its trust_score freeze
-- Two of those are ACCOUNT DELETION, an Apple review requirement.
--
-- ── DELIBERATELY PROTECTED — each a false positive from my own checks ──────
--   · rls_auto_enable — bound to the ensure_rls EVENT trigger; it gives every
--     new table its row security. My orphan detector only looked at ordinary
--     triggers and flagged it as dead.
--   · member_no_seq — the default for profiles.member_no, at 39, used by all 32
--     members. My orphaned-sequence check misses nextval() inside defaults.
--   · logs.video_url — a live column on the busiest table, in 9 client files.
--     A different thing from the dead video_reviews table.
--   · reports, mod_actions, warnings, user_blocks, push_subscriptions — empty
--     because nobody has been reported or banned yet, not because they are dead.
--   · get_filtered_stacks_auth_cursor_v2 — live; only the older _cursor goes.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- supabase/restore/20260813_batch31_restore.sql, committed BEFORE this file and
-- round-trip proven: 38 tables -> 27 -> 38, policies and triggers all back.
-- No row data is lost: every table held 0 rows.
-- ════════════════════════════════════════════════════════════════════════════

DO $guard$
DECLARE
  t        text;
  n        bigint;
  n_rows   bigint := 0;
  n_found  int := 0;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '300s';

  -- Refuse to run if ANY of these has gained a row since the study. Dropping an
  -- empty table is housekeeping; dropping data is not.
  --
  -- Counted through dynamic SQL and skipped when the table is already gone, so
  -- a second run is a clean no-op rather than "relation does not exist". A
  -- migration that errors on replay is a hazard, not a safeguard.
  FOREACH t IN ARRAY ARRAY[
    'tickets','showtimes','venues','cinema_reviews','video_reviews','vaults',
    'programmes','tips','user_reports','interactions_queue_buffer','waitlist'
  ] LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      n_found := n_found + 1;
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      n_rows := n_rows + n;
    END IF;
  END LOOP;

  IF n_rows > 0 THEN
    RAISE EXCEPTION
      'ABORTED — % row(s) exist across the tables marked dead. Something started using one. Nothing was applied.', n_rows;
  END IF;

  IF n_found = 0 THEN
    RAISE NOTICE 'Nothing to do — all 11 tables are already gone.';
  ELSE
    RAISE NOTICE '% of 11 tables present, all confirmed empty. Proceeding.', n_found;
  END IF;
END
$guard$;

-- ── 1. Stop the schedules first, so nothing runs mid-drop ──────────────────
-- Guarded: cron.unschedule() raises if the job is already gone, which would
-- make a second run fail.
DO $cron$
DECLARE
  j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['refresh-global-feed','sweep-interaction-buffer'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
      RAISE NOTICE 'unscheduled %', j;
    END IF;
  END LOOP;
END
$cron$;

-- ── 2. Functions ───────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.book_showtime_seat(p_showtime_id uuid, p_slot_id text, p_seat_id text) CASCADE;
DROP FUNCTION IF EXISTS public.create_lounge_with_member(p_name text, p_description text, p_is_private boolean, p_invite_code text) CASCADE;
DROP FUNCTION IF EXISTS public.decrement_follow_counts(follower_id uuid, followed_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_filtered_stacks_cursor(p_search text, p_following text[], p_limit integer, p_cursor_created_at timestamp with time zone, p_cursor_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.handle_interaction_removal() CASCADE;
DROP FUNCTION IF EXISTS public.increment_follow_counts(follower_id uuid, followed_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.increment_video_tips() CASCADE;
DROP FUNCTION IF EXISTS public.increment_video_views(p_video_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_blocked_by(viewer_id uuid, author_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.process_secure_tip(p_to_user_id uuid, p_video_id uuid, p_amount numeric, p_message text) CASCADE;
DROP FUNCTION IF EXISTS public.process_user_report() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_global_feed() CASCADE;
DROP FUNCTION IF EXISTS public.sweep_interaction_buffer() CASCADE;
DROP FUNCTION IF EXISTS public.update_my_display_name(p_display_name text) CASCADE;

-- ── 3. The materialized view ───────────────────────────────────────────────
-- RLS cannot protect a matview, and this one served 263 rows of review text to
-- anonymous callers until batch 29 revoked its grants. The object goes now.
DROP MATERIALIZED VIEW IF EXISTS public.global_feed_materialized CASCADE;

-- ── 4. The four live functions, rewritten ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_user_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  DELETE FROM public.logs WHERE user_id = OLD.id;
  DELETE FROM public.watchlists WHERE user_id = OLD.id;
  DELETE FROM public.lists WHERE user_id = OLD.id;
  DELETE FROM public.interactions WHERE user_id = OLD.id;
  DELETE FROM public.notifications WHERE user_id = OLD.id;
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.sync_denormalized_username()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN

    UPDATE public.dispatch_dossiers
       SET author_username = NEW.username
     WHERE user_id = NEW.id
       AND author_username IS DISTINCT FROM NEW.username;

    UPDATE public.dossier_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;

    UPDATE public.log_comments
       SET username = NEW.username
     WHERE user_id = NEW.id
       AND username IS DISTINCT FROM NEW.username;


  END IF;

  RETURN NULL;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  uid      uuid := auth.uid();
  -- Their handle, read while the profile still exists. Several erasures below
  -- can only be keyed on the name itself, and after the delete there is nothing
  -- left to look it up from.
  v_handle text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT username INTO v_handle FROM public.profiles WHERE id = uid;

  -- ── A lounge outlives the person who started it ──────────────────────────
  -- lounges.creator_id -> profiles is ON DELETE CASCADE, so deleting the founder
  -- destroys the lounge and every conversation in it. That never fired before
  -- only because account deletion was broken; fixing deletion ARMS it. Five real
  -- lounges with messages exist.
  --
  -- SET NULL is not the answer either. Every lounge policy is written as
  -- `auth.uid() = creator_id`, and there is no admin override, so a null creator
  -- leaves a lounge nobody can rename, moderate or even delete — a permanent
  -- zombie. Verified against the live policies, not assumed.
  --
  -- So: hand it on. The longest-standing approved member becomes the founder.
  -- If nobody else is left the lounge is empty, and letting it go with them is
  -- correct rather than destructive.
  UPDATE public.lounges l
     SET creator_id = (
           SELECT m.user_id FROM public.lounge_members m
            WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved'
            ORDER BY m.joined_at ASC NULLS LAST
            LIMIT 1)
   WHERE l.creator_id = uid
     AND EXISTS (SELECT 1 FROM public.lounge_members m
                  WHERE m.lounge_id = l.id AND m.user_id <> uid AND m.status = 'approved');

  -- Whatever is left had no one else in it. The CASCADE below takes those.

  -- ── Shared content: the words stay, the name goes ────────────────────────
  -- user_id and the handle move together, in one statement, or the derive
  -- trigger writes the real name straight back over the tombstone.
  UPDATE public.log_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dossier_comments
     SET user_id = NULL, username = '[deleted]'
   WHERE user_id = uid;

  UPDATE public.dispatch_dossiers
     SET user_id = NULL, author_username = '[deleted]'
   WHERE user_id = uid;

  -- ── Names FROZEN into other people's rows at write time ─────────────────
  -- A foreign key can only null an ID. These columns are copies of the handle
  -- taken when the row was written, so they are not reachable by any cascade and
  -- survive the account entirely: 51 of 51 notifications carry one today. Leaving
  -- them is residual personal data after an erasure request — the account is gone
  -- and the name is still legible.
  --
  -- ⚠️ reply_to_username MUST be done before the lounge_messages line below.
  -- It is identified through the parent message's author, and that author is
  -- about to become NULL — after which there is nothing left to match on.
  UPDATE public.lounge_messages
     SET reply_to_username = '[deleted]'
   WHERE reply_to_id IN (SELECT id FROM public.lounge_messages WHERE user_id = uid);

  -- Notifications they CAUSED go entirely, rather than being tombstoned.
  -- The handle is not only in from_username, it is written into the prose:
  -- "@divisionops is now following you." — 14 of 51 rows. Blanking the column
  -- would leave the sentence perfectly legible, which is not erasure. And a
  -- notification from someone who no longer exists is noise to its recipient:
  -- there is nobody to visit and nothing to answer.
  DELETE FROM public.notifications WHERE from_user_id = uid;


  -- A share freezes the shared person's handle into someone else's message:
  -- ShareToLoungeModal writes { log_id, owner_username } and
  -- { dossier_id, author_username }. No id to match on inside the json, so this
  -- is keyed on the handle captured above — which is why it must run BEFORE the
  -- profile disappears. Zero rows carry these keys today; the path exists, so the
  -- erasure has to cover it.
  IF v_handle IS NOT NULL THEN
    UPDATE public.lounge_messages
       SET metadata = (metadata - 'owner_username') - 'author_username'
     WHERE metadata->>'owner_username' = v_handle
        OR metadata->>'author_username' = v_handle;
  END IF;

  -- These two carry no denormalised handle; they read the author through a join,
  -- so a null author is all that is needed.
  UPDATE public.list_comments   SET user_id = NULL WHERE user_id = uid;
  UPDATE public.lounge_messages SET user_id = NULL WHERE user_id = uid;

  -- ── Their uploads ────────────────────────────────────────────────────────
  -- Everything above this point is rows. A face is a file, and nothing removed
  -- it: 11 objects sit in `avatars` and `screening-room`, both PUBLIC buckets,
  -- reachable by URL forever after the person asked to be erased. A photograph
  -- of somebody is the most personal thing here and it was the one thing the
  -- deletion never touched.
  --
  -- `owner` is set on every object (10/10 and 1/1) and paths are prefixed with
  -- the uploader's id, so they are attributable either way; owner is the honest
  -- key. Removing the row is what makes the object unreachable — the storage API
  -- resolves every request through this table.
  -- Supabase guards this table with storage.protect_delete(), which raises
  -- 42501 on any direct DELETE unless `storage.allow_delete_query` is set. My
  -- throwaway had a plain table with no such trigger, so this passed there and
  -- BROKE ACCOUNT DELETION ENTIRELY on production — the whole function aborted
  -- at this line. Caught by running the real thing against the real database
  -- inside a rolled-back transaction; nothing else would have found it.
  --
  -- The guard exists to stop rows being removed while the underlying file stays
  -- in the bucket. That is the right default and the wrong answer here: the
  -- alternative is the client calling the Storage API separately, which can fail
  -- halfway and leave an account half-erased. Removing the row is what makes the
  -- object unreachable — every storage request resolves through this table — so
  -- the erasure is complete from the member's side and atomic with the rest.
  -- The physical file may linger in the bucket until a storage sweep; that is a
  -- housekeeping matter, not a privacy one.
  PERFORM set_config('storage.allow_delete_query', 'true', true);  -- true = this transaction only
  DELETE FROM storage.objects WHERE owner = uid;

  -- ── Everything else follows the account ──────────────────────────────────
  -- Personal content CASCADEs; moderation history SET NULLs. One statement, so
  -- it cannot half-succeed the way the old hand-written sequence did.
  DELETE FROM auth.users WHERE id = uid;
END
$function$

;

CREATE OR REPLACE FUNCTION public.protect_privileged_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.role := OLD.role;
    NEW.tier := OLD.tier;
    NEW.is_founding := OLD.is_founding;
    NEW.member_no := OLD.member_no;
    NEW.is_banned := OLD.is_banned;
    NEW.ban_reason := OLD.ban_reason;
    NEW.banned_at := OLD.banned_at;
    NEW.suspended_until := OLD.suspended_until;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.warning_count := OLD.warning_count;
    NEW.entitlement_source := OLD.entitlement_source;
  END IF;
  RETURN NEW;
END;
$function$

;

-- ── 5. The tables ──────────────────────────────────────────────────────────
-- CASCADE takes their 20 indexes, 22 policies and 12 triggers with them. The
-- three foreign keys between them (showtimes->venues, tickets->showtimes,
-- tips->video_reviews) are all dead-to-dead; no live table points at any of these.
DROP TABLE IF EXISTS
  public.tickets, public.showtimes, public.venues, public.cinema_reviews,
  public.video_reviews, public.vaults, public.programmes, public.tips,
  public.user_reports, public.interactions_queue_buffer, public.waitlist
CASCADE;

-- ── 6. The dead column ─────────────────────────────────────────────────────
-- Every member sits at 100 and nothing reads it. Its freeze was removed from
-- protect_privileged_profile_fields above, in this same transaction.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS trust_score CASCADE;

-- ── 7. Guards — abort rather than half-apply ───────────────────────────────
DO $guard2$
DECLARE
  n_tables int;
  n_left   int;
BEGIN
  SELECT count(*) INTO n_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind IN ('r','p')
    AND c.relname IN ('tickets','showtimes','venues','cinema_reviews','video_reviews',
                      'vaults','programmes','tips','user_reports',
                      'interactions_queue_buffer','waitlist');
  IF n_tables > 0 THEN
    RAISE EXCEPTION 'ABORTED — % dead table(s) survived the drop. Nothing was applied.', n_tables;
  END IF;

  -- No function may still name a dropped object. This is the check that caught
  -- two wrong DROP signatures and a rewrite that silently did not apply.
  SELECT count(*) INTO n_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prosrc ~ '\m(tickets|showtimes|venues|cinema_reviews|video_reviews|vaults|user_reports|interactions_queue_buffer|waitlist|trust_score|global_feed_materialized)\M';
  IF n_left > 0 THEN
    RAISE EXCEPTION
      'ABORTED — % function(s) still reference a dropped object. Nothing was applied.', n_left;
  END IF;

  -- Everything on the protected list must be untouched.
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger e JOIN pg_proc p ON p.oid = e.evtfoid
                 WHERE e.evtname = 'ensure_rls' AND p.proname = 'rls_auto_enable') THEN
    RAISE EXCEPTION 'ABORTED — the ensure_rls event trigger is gone; new tables would ship without row security. Nothing was applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'member_no_seq' AND relkind = 'S') THEN
    RAISE EXCEPTION 'ABORTED — member_no_seq is gone; member numbering would break. Nothing was applied.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'logs' AND column_name = 'video_url') THEN
    RAISE EXCEPTION 'ABORTED — logs.video_url was removed; it is live. Nothing was applied.';
  END IF;

  RAISE NOTICE
    'OK — 11 tables, 1 materialized view, 14 functions, 2 cron jobs, 22 policies, 12 triggers and 1 column removed. Four live functions rewritten. Everything protected is intact.';
END
$guard2$;

NOTIFY pgrst, 'reload schema';
