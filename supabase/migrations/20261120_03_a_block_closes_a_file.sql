-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_03 — a member who blocked another, or was blocked, is a closed file to them.
-- ════════════════════════════════════════════════════════════════════════════
--   1. A member another had blocked still read the blocker's Watchlist, Vault, follow lists and every
--      figure drawn from their records: can_view_user_data now closes a file across a block, so every
--      rule and figure that asks it closes with it, and get_profile_counts counts no follow across a
--      block (review round 14).
--   2. That test, asked directly, told a member who had blocked them: it moves to the schema the API
--      never serves (private), public.can_view_user_data staying for the house alone (review round 14).
--   3. The seats a block stands between today are let go once, here, as a new block's are (review
--      round 14).
--   4. The house's functions that asked the test by its public name (audience_allows, get_taste_match,
--      get_profile_counts) ask private.can_view_user_data, and each question of a member's counts is
--      asked once a call (the load lab, round 14's train).
--   Functions and the one-time pass (row locks on those seats alone); no table is locked whole. The
--   rules that read private.* are the car 20261120_04, the follows' index 20261120_05.
-- Undo: mobile/supabase/migrations-down/20261120_03_a_block_closes_a_file.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 · a member who blocked another, or was blocked, is a closed file to them (review round 14) ──
--   A member another had blocked still read the blocker's Watchlist, Vault and follow lists, and every
--   figure the house draws from the blocker's records: the header's FILMS, the statistics, the Taste
--   DNA, the honours and the taste match. The blocker's logs and stacks were hidden from them (round
--   10's logs_hide_blocked and lists_hide_blocked), but the one test every other rule and figure asks,
--   can_view_user_data, knew nothing of blocks: the Watchlist and Vault rules are that test alone, and
--   get_profile_counts, get_user_analytics, get_taste_profile, get_public_profile_analytics and
--   get_taste_match each ask it and nothing more, so each drew the whole record.
--   1. can_view_user_data now asks what audience_allows asks through a_block_stands_between (a block
--      either way), so across a block a file is closed, as a private member's is to a stranger, and
--      every rule and figure that asks it closes with it: the Watchlist, the Vault, the logs' own rule,
--      a stack's films and critiques, the statistics, the fingerprint, the honours and the match
--      ('forbidden'), and the counts (0). A member's own file and a visitor answer as before. The block
--      is read in the same statement as the member's row, each way by the pair's own unique index:
--      a_block_stands_between called from here cost 21 microseconds a call over the 11 the test cost
--      before; read here, 8, and the rules that ask it ask it of a page of rows.
--   2. Asked directly, that test would tell a member, one member at a time, whether that member had
--      blocked them. It moves (the same function, so every read rule that asks it follows) to the
--      schema the API never serves, private, which H-A5 makes for hidden_authors (made here too, the
--      same way, whichever of the two runs first). public.can_view_user_data stays, asking it, for the
--      house's own functions that call it by that name (each runs as the house), with no grant to a
--      member or the visitor. Neither app calls it (TestFlight build 41 and the website checked): an
--      old caller is refused (42501), as a member asking for hidden_authors is.
--   3. A follow is seen when either end's file is open, so the blocker's follows of open members stayed
--      readable: private.no_block_stands_with answers, for the follows rule (the car after this one),
--      whether a block stands between the caller and either end. Never served by the API either.
--   4. get_profile_counts counts no followers or follows of a member across a block, as the list it
--      opens holds none.
--   A mute is the muter's own choice and closes no file, as in audience_allows.

-- The schema the API never serves (H-A5 makes it the same way; whichever runs first makes it).
CREATE SCHEMA IF NOT EXISTS private;
-- add-only (1): no shipped client uses it: a schema made here, named by neither TestFlight build 41 nor the website
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;
COMMENT ON SCHEMA private IS 'Functions the read rules and members'' own functions call as the member, and the API never serves: what a member must never ask directly.';

-- Moved whole (the same function, so the eight read rules that ask it follow), once.
-- add-only (3): it only fixes: every read rule that asks it asks it where it now is, a member's own file, a visitor's, a private member's and an open one's as before, none across a block; replayed as the members themselves (H-A2 rehearsal)
DO $$
BEGIN
  IF to_regprocedure('private.can_view_user_data(uuid)') IS NULL THEN
    ALTER FUNCTION public.can_view_user_data(uuid) SET SCHEMA private;
  END IF;
END $$;

-- add-only (3): it only fixes: the reads replayed as the members themselves, a member's own file, a visitor's, a private member's and an open one's as before, none across a block (H-A2 rehearsal)
CREATE OR REPLACE FUNCTION private.can_view_user_data(target_uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_me          uuid := auth.uid();
  is_private    boolean;
  profile_found boolean;
  is_following  boolean;
  across        boolean;
BEGIN
  IF v_me = target_uid THEN RETURN TRUE; END IF;

  -- The member's row, and whether a block stands between them and the caller either way (the rule
  -- of a_block_stands_between; a visitor, with no one signed in, has none).
  SELECT p.is_social_private, TRUE,
         EXISTS (SELECT 1 FROM public.user_blocks b
                  WHERE b.blocker_id = v_me AND b.blocked_id = p.id AND b.type = 'block')
      OR EXISTS (SELECT 1 FROM public.user_blocks b
                  WHERE b.blocker_id = p.id AND b.blocked_id = v_me AND b.type = 'block')
    INTO is_private, profile_found, across
    FROM public.profiles p WHERE p.id = target_uid;

  IF NOT COALESCE(profile_found, false) OR across THEN RETURN FALSE; END IF;
  IF NOT COALESCE(is_private, false)   THEN RETURN TRUE;  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.interactions
    WHERE type = 'follow' AND user_id = v_me AND target_user_id = target_uid
  ) INTO is_following;

  RETURN COALESCE(is_following, false);
END $$;
COMMENT ON FUNCTION private.can_view_user_data(uuid) IS 'Whether the caller may read a member''s file: their own, an open member''s, a private member''s they follow, never one across a block. Asked by the read rules as the member; never served by the API, so no member can ask it of one member after another.';
-- add-only (1): no shipped client uses it: a function moved here, called by neither TestFlight build 41 nor the website
REVOKE ALL ON FUNCTION private.can_view_user_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_user_data(uuid) TO anon, authenticated, service_role;

-- The public name, for the house's own functions that call it (each runs as the house): no member's.
-- add-only (1): no shipped client uses it: the house's own name for the test, dropped first only so the piece runs again; neither TestFlight build 41 nor the website calls it
DROP FUNCTION IF EXISTS public.can_view_user_data(uuid);
CREATE FUNCTION public.can_view_user_data(target_uid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT private.can_view_user_data(target_uid);
$$;
COMMENT ON FUNCTION public.can_view_user_data(uuid) IS 'private.can_view_user_data(), for the house''s own functions that call it by this name. No member or visitor may call it: the API would serve it.';
-- add-only (1): no shipped client uses it: neither TestFlight build 41 nor the website calls it; a member asking the API for it is refused, which is the fix
REVOKE ALL ON FUNCTION public.can_view_user_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_user_data(uuid) TO service_role;

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.no_block_stands_with(uuid, uuid);
CREATE FUNCTION private.no_block_stands_with(p_one uuid, p_two uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Whether no block stands, either way, between the caller and either of two members: the follows
  -- rule asks it of a follow whose one end's file is open to the caller. The blocks are read as the
  -- house (a member may read only their own); a visitor has none.
  SELECT NOT EXISTS (SELECT 1 FROM public.user_blocks b
                      WHERE b.blocker_id = (SELECT auth.uid()) AND b.blocked_id IN (p_one, p_two) AND b.type = 'block')
     AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
                      WHERE b.blocked_id = (SELECT auth.uid()) AND b.blocker_id IN (p_one, p_two) AND b.type = 'block');
$$;
COMMENT ON FUNCTION private.no_block_stands_with(uuid, uuid) IS 'Whether no block stands between the caller and either of two members, for the follows rule. Never served by the API.';
-- add-only (1): no shipped client uses it: a function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.no_block_stands_with(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.no_block_stands_with(uuid, uuid) TO anon, authenticated, service_role;

-- add-only (3): it only fixes: the calls replayed as the members themselves, every count as before and none of a member across a block (H-A2 rehearsal)
CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT json_build_object(
    -- Each question of the caller asked once a call (an InitPlan each), never once a row.
    'logs_count',      CASE WHEN me.open
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id) ELSE 0 END,
    'ledger_count',    CASE WHEN me.open
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
                                    AND (rating > 0 OR COALESCE(review, '') <> '')) ELSE 0 END,
    'watchlist_count', CASE WHEN me.open
                            THEN (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id) ELSE 0 END,
    'vault_count',     CASE WHEN me.open
                            THEN (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id) ELSE 0 END,
    'lists_count',     CASE WHEN me.open
                            THEN (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id
                                    AND (is_private = false OR user_id = (SELECT auth.uid()))) ELSE 0 END,
    -- Across a block the follows rule shows none of the member's follows, so none are counted.
    'followers_count', CASE WHEN me.across THEN 0 ELSE
                         (SELECT COUNT(*) FROM interactions i WHERE i.target_user_id = p_user_id AND i.type = 'follow'
                            AND NOT COALESCE(i.user_id = ANY (me.hidden), false)) END,
    'following_count', CASE WHEN me.across THEN 0 ELSE
                         (SELECT COUNT(*) FROM interactions i WHERE i.user_id = p_user_id AND i.type = 'follow'
                            AND NOT COALESCE(i.target_user_id = ANY (me.hidden), false)) END
  )
  FROM (SELECT (SELECT private.hidden_authors()) AS hidden,
               (SELECT private.can_view_user_data(p_user_id)) AS open,
               (SELECT COALESCE(auth.uid() IS DISTINCT FROM p_user_id
                        AND public.a_block_stands_between(auth.uid(), p_user_id), false)) AS across) me;
$$;

-- ── A member who was blocked meets the blocker as no one (review round 14) ──────────────────────────
--   The figures closing across a block still told the blocked member, for one member at a time, that
--   they had been blocked: the blocker's profile row stood open (an open member) while every figure of
--   it answered 'forbidden'. The member who chose the block knows it; the member blocked must not
--   learn it. So to the member blocked, the blocker is no one: the blocker's profile row, salons,
--   seats in salons, reactions and old dossiers are read by them as rows that do not
--   exist (the read rules in the car after this one), and each figure answers them exactly as it
--   answers an id no member holds (it already does: the file is closed, as a file of no member is).
--   The blocker sees the member they blocked as before; an admin sees everyone, to moderate.
--   private.members_blocking_me answers the read rules, once a statement, who has blocked the caller.
--   It lives in private, which the API never serves, so no member can ask it.

-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.members_blocking_me();
CREATE FUNCTION private.members_blocking_me() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- The members who have blocked the caller: for the read rules alone, which read each of them as no
  -- one. None for a visitor (no one signed in), and none for an admin, who moderates every member.
  -- Read as the house (the owner of the tables), so the profiles rule that asks it is not asked again.
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN '{}'::uuid[]
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.role = 'admin') THEN '{}'::uuid[]
    ELSE COALESCE((SELECT array_agg(b.blocker_id) FROM public.user_blocks b
                    WHERE b.blocked_id = (SELECT auth.uid()) AND b.type = 'block'), '{}'::uuid[])
  END;
$$;
COMMENT ON FUNCTION private.members_blocking_me() IS 'The members who have blocked the caller, for the read rules that read each of them as no one to the caller. Never served by the API.';
-- add-only (1): no shipped client uses it: a function this piece makes, called by no client (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.members_blocking_me() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.members_blocking_me() TO anon, authenticated, service_role;

--   A block took the follows and the requests both ways; a seat stayed. A member blocked, seated in
--   the blocker's salon, would sit in a room whose host was no one; a blocker seated in the blocked
--   member's salon would be counted there and never shown to its host, who could not see or move
--   them. A block now also takes each one's seat (approved, muted or waiting at the door) in the
--   other's salons, both ways, as it takes the follows. A ban the host gave stays a ban.
-- add-only (3): it only fixes: everything it took it takes, and the seats of the two in each other's salons as well; replayed as the members themselves (H-A2 rehearsal)
CREATE OR REPLACE FUNCTION public.sever_follows_on_block() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.type = 'block' THEN
    -- The follows and the requests, both ways: a request left waiting could be admitted later.
    DELETE FROM public.interactions
    WHERE type IN ('follow', 'follow_request')
      AND ((user_id = NEW.blocker_id AND target_user_id = NEW.blocked_id)
        OR (user_id = NEW.blocked_id AND target_user_id = NEW.blocker_id));
    -- Each one's seat in the other's salons, both ways (a ban stays the host's).
    DELETE FROM public.lounge_members m
     USING public.lounges l
     WHERE l.id = m.lounge_id
       AND m.status IN ('approved', 'muted', 'pending')
       AND ((m.user_id = NEW.blocked_id AND l.creator_id = NEW.blocker_id)
         OR (m.user_id = NEW.blocker_id AND l.creator_id = NEW.blocked_id));
  END IF;
  RETURN NEW;
END $$;

-- The blocks that stand today: each one's seat in the other's salons goes now, as a new block's does.
DELETE FROM public.lounge_members m
 USING public.lounges l, public.user_blocks b
 WHERE l.id = m.lounge_id
   AND b.type = 'block'
   AND m.status IN ('approved', 'muted', 'pending')
   AND ((m.user_id = b.blocked_id AND l.creator_id = b.blocker_id)
     OR (m.user_id = b.blocker_id AND l.creator_id = b.blocked_id));

-- The house's own functions that asked the rule by its public name (two calls, each with its own
-- settings, where one is the rule): each asks private.can_view_user_data, otherwise as production holds it.
-- add-only (3): it only fixes: audience_allows asks private.can_view_user_data where the rule lives, one call where the public name made two, every answer as before; replayed as the members themselves
CREATE OR REPLACE FUNCTION public.audience_allows(p_actor uuid, p_owner uuid, p_pref text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN TRUE
    WHEN auth.uid() = p_owner THEN TRUE
    WHEN public.a_block_stands_between(auth.uid(), p_owner) THEN FALSE
    WHEN NOT private.can_view_user_data(p_owner) THEN FALSE
    WHEN COALESCE(p_pref, 'everyone') = 'everyone' THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'nobody' THEN FALSE
    ELSE EXISTS (SELECT 1 FROM public.interactions
                 WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = p_owner)
  END;
$$;

-- add-only (3): it only fixes: get_taste_match asks private.can_view_user_data where the rule lives, one call where the public name made two, every answer as before; replayed as the members themselves
CREATE OR REPLACE FUNCTION public.get_taste_match(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR NOT private.can_view_user_data(p_user_id)
      THEN '{"error": "forbidden"}'::jsonb
    ELSE jsonb_build_object('mine', public.taste_shape(auth.uid()), 'theirs', public.taste_shape(p_user_id))
  END;
$$;
