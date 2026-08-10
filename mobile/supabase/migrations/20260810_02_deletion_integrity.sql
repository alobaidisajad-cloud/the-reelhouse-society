-- ============================================================================
-- BATCH 28 · deletion actually works
-- ============================================================================
--
-- Three live bugs, each reproduced on a throwaway database before writing this.
--
-- 1. A MEMBER CANNOT DELETE THEIR OWN LOG once anyone has endorsed it.
--       interactions.target_log_id -> logs  ON DELETE NO ACTION
--    The delete raises a foreign-key violation. 76 endorsements on logs and 4 on
--    lists exist right now, so this is happening to real people. Same for lists.
--
-- 2. WHEN A DELETE DOES SUCCEED, THE COMMENTS SURVIVE IT.
--    log_comments.log_id has NO foreign key at all — it is the only child link in
--    the schema that was never declared. The comments simply point at nothing.
--
-- 3. ACCOUNT DELETION IS COMPLETELY BROKEN, for everyone.
--    request_account_deletion clears six blockers and then runs
--    `DELETE FROM auth.users`, which fails immediately on profiles_id_fkey —
--    a plain FOREIGN KEY (id) REFERENCES auth.users(id) with no ON DELETE at all.
--    Reproduced: the statement errors and the account survives intact. Apple
--    requires in-app account deletion, so this is a launch blocker.
--
-- ── THE SHAPE OF THE FIX ────────────────────────────────────────────────────
-- Put the intent in the SCHEMA, not in a function that has to remember the right
-- order. A cascade is atomic and cannot half-succeed; a cleanup routine can, and
-- the current one does — it deletes six things and then fails, leaving the member
-- partly erased.
--
-- Three kinds of link, three answers:
--
--   PERSONAL      logs, lists, watchlists, vaults, tickets, venues, and their own
--                 endorsements          -> CASCADE. It goes when they go.
--
--   SHARED        comments on other people's work, lounge messages, dossiers
--                 others certified      -> SET NULL. The words stay, the name
--                 goes. Deleting an account should not tear holes in other
--                 people's conversations; a thread with half its replies missing
--                 is worse for everyone still in it, and the person leaving gains
--                 nothing. Removing the identity IS the erasure.
--
--   AUDIT         mod_actions, warnings, reports -> SET NULL. Moderation history
--                 must survive the moderator leaving.
--
-- ── WHY SET NULL IS SAFE HERE, VERIFIED NOT ASSUMED ─────────────────────────
-- Those five author columns are NOT NULL today, so SET NULL needs the constraint
-- dropped. That is only safe because RLS still pins the author on insert: every
-- one of the five has a policy whose check is `auth.uid() = user_id` (for the two
-- declared as ALL with only USING, PostgreSQL applies USING as the insert check).
-- NULL never equals auth.uid(), so a comment with no author still cannot be
-- created — the column merely becomes able to LOSE its author later.
--
-- And the display name survives independently: log_comments, dossier_comments and
-- video_reviews each carry their own `username` copy, and
-- derive_username_column() RETURNS EARLY when user_id IS NULL, so it will not
-- overwrite the tombstone handle with a lookup of a profile that no longer exists.
--
-- ── SAFE ON EXISTING DATA ───────────────────────────────────────────────────
-- Checked live: ZERO dangling rows on every link touched here, including the six
-- reference-shaped columns that have no foreign key at all. So the new
-- constraints validate immediately rather than needing NOT VALID.
--
-- Cascading a log delete removes only endorse/react/retransmit rows. It cannot
-- corrupt follower counts: handle_follow_count_change() only acts on
-- `type = 'follow'`, and live data has 11 follows, none of which target a log or
-- list, against 90 rows that do.
--
-- Fails loudly, refuses to wait for a lock, convergent on re-run.
-- ============================================================================

DO $$
DECLARE
  c        record;
  missing  text[] := '{}';
  applied  int := 0;
BEGIN
  SET LOCAL lock_timeout = '3s';
  SET LOCAL statement_timeout = '120s';

  -- ── PASS 1: every target must exist before anything changes ───────────────
  FOR c IN
    SELECT * FROM (VALUES
      ('interactions','target_log_id'), ('interactions','target_list_id'),
      ('interactions','user_id'),       ('interactions','target_user_id'),
      ('log_comments','log_id'),        ('log_comments','user_id'),
      ('list_comments','user_id'),      ('dossier_comments','user_id'),
      ('lounge_messages','user_id'),    ('dispatch_dossiers','user_id'),
      ('logs','user_id'),               ('lists','user_id'),
      ('watchlists','user_id'),         ('vaults','user_id'),
      ('tickets','user_id'),            ('venues','owner_id'),
      ('mod_actions','admin_id'),       ('mod_actions','target_user_id'),
      ('reports','target_user_id'),     ('warnings','admin_id'),
      ('profiles','id')
    ) AS t(tbl, col)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=c.tbl AND column_name=c.col) THEN
      missing := missing || format('%s.%s', c.tbl, c.col);
    END IF;
  END LOOP;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION 'ABORTED — % target column(s) do not exist: %. Nothing was changed.',
      array_length(missing,1), array_to_string(missing, ', ');
  END IF;

  -- ── PASS 2: the five shared-author columns must be able to lose their author
  -- Done BEFORE the SET NULL constraints, or the first cascade would violate
  -- NOT NULL and abort the member's deletion halfway.
  FOR c IN
    SELECT * FROM (VALUES
      ('log_comments'),('list_comments'),('dossier_comments'),
      ('lounge_messages'),('dispatch_dossiers')
    ) AS t(tbl)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id DROP NOT NULL', c.tbl);
  END LOOP;

  -- ── PASS 3: re-declare each link with the right answer ────────────────────
  FOR c IN
    SELECT * FROM (VALUES
      -- child table,        column,            parent,       action
      ('interactions',     'target_log_id',   'logs',      'CASCADE'),
      ('interactions',     'target_list_id',  'lists',     'CASCADE'),
      ('interactions',     'user_id',         'profiles',  'CASCADE'),
      ('interactions',     'target_user_id',  'profiles',  'CASCADE'),
      ('logs',             'user_id',         'profiles',  'CASCADE'),
      ('lists',            'user_id',         'profiles',  'CASCADE'),
      ('watchlists',       'user_id',         'profiles',  'CASCADE'),
      ('vaults',           'user_id',         'profiles',  'CASCADE'),
      ('tickets',          'user_id',         'profiles',  'CASCADE'),
      ('venues',           'owner_id',        'profiles',  'CASCADE'),
      -- The chain BELOW venues, or the cascade above stops dead on it.
      -- profile -> venues CASCADE, but showtimes.venue_id was NO ACTION, and
      -- tickets.showtime_id below that. A venue owner's account deletion would
      -- fail on showtimes_venue_id_fkey — reproduced. All three tables are empty
      -- today, so this is a hole that has not been fallen into yet rather than
      -- one anybody has hit. Account deletion is legally required; it must not
      -- depend on which corner of the product someone happened to use.
      ('showtimes',        'venue_id',        'venues',    'CASCADE'),
      ('tickets',          'showtime_id',     'showtimes', 'CASCADE'),
      -- the link that never existed
      ('log_comments',     'log_id',          'logs',      'CASCADE'),
      -- shared: the words stay, the name goes
      ('log_comments',     'user_id',         'profiles',  'SET NULL'),
      ('list_comments',    'user_id',         'profiles',  'SET NULL'),
      ('dossier_comments', 'user_id',         'profiles',  'SET NULL'),
      ('lounge_messages',  'user_id',         'profiles',  'SET NULL'),
      ('dispatch_dossiers','user_id',         'profiles',  'SET NULL'),
      -- audit: history outlives the people in it
      ('mod_actions',      'admin_id',        'profiles',  'SET NULL'),
      ('mod_actions',      'target_user_id',  'profiles',  'SET NULL'),
      ('reports',          'target_user_id',  'profiles',  'SET NULL'),
      ('warnings',         'admin_id',        'profiles',  'SET NULL')
    ) AS t(tbl, col, parent, action)
  LOOP
    -- Drop whatever FK currently sits on this column, whatever it was named and
    -- whichever table it pointed at. log_comments.user_id referenced auth.users
    -- while its four siblings referenced profiles; naming the constraint would
    -- have missed that.
    DECLARE
      v_name text;
    BEGIN
      SELECT con.conname INTO v_name
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = con.conkey[1]
      WHERE con.contype='f' AND n.nspname='public'
        AND cl.relname = c.tbl AND a.attname = c.col
      LIMIT 1;

      IF v_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, v_name);
      END IF;

      -- ⚠️ THE NAME IS PART OF THE PUBLIC INTERFACE. PUT IT BACK UNCHANGED.
      --
      -- PostgREST lets a client disambiguate a join by naming the constraint:
      --     profiles!logs_user_id_fkey(username, role, avatar_url)
      -- Both apps do this in 29 places across 8 constraints. An earlier draft of
      -- this migration recreated each key as `<table>_<col>_fk`, which would have
      -- renamed 5 of those 8 and broken every one of those queries — including in
      -- the TestFlight build already in people's hands, which cannot be patched.
      --
      -- A foreign key's name looks like an implementation detail. Here it is an
      -- API. Reuse the captured name; only a genuinely new key gets a new one,
      -- under the convention PostgREST and everyone else expects.
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
        c.tbl,
        COALESCE(v_name, c.tbl || '_' || c.col || '_fkey'),
        c.col, c.parent, c.action);
    END;
    applied := applied + 1;
  END LOOP;

  -- ── PASS 4: the top of the chain ──────────────────────────────────────────
  -- profiles.id -> auth.users had no ON DELETE at all, which is the single
  -- constraint that made account deletion impossible: every other blocker could
  -- be cleared by hand, but the profile row itself always remained.
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  applied := applied + 1;

  RAISE NOTICE 'OK — % foreign keys re-declared. Deletion now works end to end.', applied;
END $$;

-- ============================================================================
-- request_account_deletion — now that the schema can actually do it
-- ============================================================================
-- The old body cleared six blockers by hand and then ran DELETE FROM auth.users,
-- which failed on profiles_id_fkey every time. With the cascades above, the
-- single DELETE now carries the whole account: profile, logs, lists, watchlists,
-- vaults, tickets, venues and their own endorsements.
--
-- What it still has to do BY HAND is the tombstone, and the ORDER IS LOAD-BEARING.
--
-- `derive_username_column()` fires BEFORE UPDATE and copies the live handle out
-- of profiles into the comment. So an UPDATE that sets only the tombstone, while
-- user_id still points at a live profile, is IMMEDIATELY OVERWRITTEN with the
-- real name — the anonymisation silently does nothing. Proven on a throwaway:
--
--     UPDATE ... SET username='[deleted]' WHERE user_id=uid   -> 'vanishing'
--     UPDATE ... SET user_id=NULL, username='[deleted]' ...   -> '[deleted]'
--
-- Nulling the author in the SAME statement makes the trigger return early, and
-- the tombstone survives. Hence one statement per table, never two.
--
-- '[deleted]' cannot collide with a real handle: the username charset backstop
-- rejects brackets.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_account_deletion()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  UPDATE public.tips          SET from_username = '[deleted]' WHERE from_user_id = uid;
  UPDATE public.video_reviews SET user_id = NULL, username = '[deleted]' WHERE user_id = uid;

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

  -- ── Everything else follows the account ──────────────────────────────────
  -- Personal content CASCADEs; moderation history SET NULLs. One statement, so
  -- it cannot half-succeed the way the old hand-written sequence did.
  DELETE FROM auth.users WHERE id = uid;
END
$function$;

REVOKE ALL ON FUNCTION public.request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
--   SELECT c.relname||'.'||a.attname AS child, rc.relname AS parent,
--          CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
--               WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' END AS on_delete
--     FROM pg_constraint con
--     JOIN pg_class c  ON c.oid  = con.conrelid
--     JOIN pg_class rc ON rc.oid = con.confrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
--    WHERE con.contype='f' AND n.nspname='public'
--      AND (rc.relname IN ('logs','lists','profiles') OR c.relname='profiles')
--    ORDER BY 2,1;
--
-- Expect NO remaining "NO ACTION" against logs, lists or profiles.
-- ============================================================================
