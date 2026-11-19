-- Undo of 20261120_03: a member who blocked another, or was blocked, is a closed file to them, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-A2 undone · can_view_user_data back in public as 20261116_01 left it; no_block_stands_with gone ──
--   The follows rule is put back first (H-A2.locks.down.sql). The house's alias goes, and the test
--   moves back whole (the read rules follow it), with its old body and grants. The schema private goes
--   when nothing else is in it (H-A5 keeps it otherwise, and takes it away itself).
DROP FUNCTION IF EXISTS public.can_view_user_data(uuid);
DO $$
BEGIN
  IF to_regprocedure('private.can_view_user_data(uuid)') IS NOT NULL THEN
    ALTER FUNCTION private.can_view_user_data(uuid) SET SCHEMA public;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.can_view_user_data(target_uid uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  is_private    boolean;
  profile_found boolean;
  is_following  boolean;
BEGIN
  IF auth.uid() = target_uid THEN RETURN TRUE; END IF;

  SELECT is_social_private, TRUE INTO is_private, profile_found
    FROM public.profiles WHERE id = target_uid;

  IF NOT COALESCE(profile_found, false) THEN RETURN FALSE; END IF;
  IF NOT COALESCE(is_private, false)   THEN RETURN TRUE;  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.interactions
    WHERE type = 'follow' AND user_id = auth.uid() AND target_user_id = target_uid
  ) INTO is_following;

  RETURN COALESCE(is_following, false);
END $$;
COMMENT ON FUNCTION public.can_view_user_data(uuid) IS NULL;
REVOKE ALL ON FUNCTION public.can_view_user_data(uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_view_user_data(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS private.no_block_stands_with(uuid, uuid);
DROP FUNCTION IF EXISTS private.members_blocking_me();

-- A block takes the follows and the requests again, and no seat. (The seats it took are not put
-- back: undoing the rule does not undo what members' blocks did.)
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
  END IF;
  RETURN NEW;
END $$;

-- The schema goes when nothing else is in it.
DO $$
BEGIN
  IF to_regnamespace('private') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_namespace n ON n.oid = d.refobjid
                      WHERE d.refclassid = 'pg_namespace'::regclass AND n.nspname = 'private') THEN
    DROP SCHEMA private;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_profile_counts(p_user_id uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT json_build_object(
    'logs_count',      CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id) ELSE 0 END,
    'ledger_count',    CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM logs WHERE user_id = p_user_id
                                    AND (rating > 0 OR COALESCE(review, '') <> '')) ELSE 0 END,
    'watchlist_count', CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM watchlists WHERE user_id = p_user_id) ELSE 0 END,
    'vault_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM physical_archive WHERE user_id = p_user_id) ELSE 0 END,
    'lists_count',     CASE WHEN public.can_view_user_data(p_user_id)
                            THEN (SELECT COUNT(*) FROM lists WHERE user_id = p_user_id
                                    AND (is_private = false OR user_id = auth.uid())) ELSE 0 END,
    'followers_count', (SELECT COUNT(*) FROM interactions i WHERE i.target_user_id = p_user_id AND i.type = 'follow'
                          AND NOT COALESCE(i.user_id = ANY (me.hidden), false)),
    'following_count', (SELECT COUNT(*) FROM interactions i WHERE i.user_id = p_user_id AND i.type = 'follow'
                          AND NOT COALESCE(i.target_user_id = ANY (me.hidden), false))
  )
  FROM (SELECT public.hidden_authors() AS hidden) me;
$$;
