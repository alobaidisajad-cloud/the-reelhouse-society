-- ════════════════════════════════════════════════════════════════════════════
-- 20261015_06 — a row keeps what it is: a member edits the words, never the place.
-- ════════════════════════════════════════════════════════════════════════════
-- A member may change what they wrote and how it reads (a salon message, once
-- said, is not changed at all). What a row is stays as it was written: whose it
-- is, what kind it is, what it belongs to or points at, and when it was made;
-- a warning keeps the house's words, a salon its count of seats, and a notice
-- what it says. dispatch_comments and dispatch_posts have held this
-- since their pin_columns triggers; every other table a member may edit holds it
-- here, with one trigger function given each table's columns to keep.
-- The house's own roles (postgres, which every SECURITY DEFINER function runs
-- as, service_role and supabase_admin) are not held: the functions that accept a
-- request, approve a seat or scrub a departed member still change these columns.
-- Named to run after a_clean_member_text (a member's words are cleaned first, by
-- the house's rule) and before every other BEFORE UPDATE trigger that reads a
-- kept column, so each reads the row as it will be kept. A kept column is quietly
-- put back, as pin_columns does: an edit that sends the whole row unchanged still
-- succeeds.
-- Undo: mobile/supabase/migrations-down/20261015_06_a_row_keeps_what_it_is.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.a_row_keeps_what_it_is() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  kept jsonb := '{}'::jsonb;
  was  jsonb := to_jsonb(OLD);
  col  text;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  FOREACH col IN ARRAY TG_ARGV LOOP
    kept := kept || jsonb_build_object(col, was -> col);
  END LOOP;
  RETURN jsonb_populate_record(NEW, kept);
END $$;

REVOKE ALL ON FUNCTION public.a_row_keeps_what_it_is() FROM PUBLIC;

-- Each table, and the columns its rows keep.
CREATE TEMP TABLE kept_columns (tbl text, cols text[]) ON COMMIT DROP;
INSERT INTO kept_columns VALUES
  ('interactions',             ARRAY['user_id', 'target_user_id', 'target_log_id', 'target_list_id', 'target_film_id',
                                     'target_review_id', 'type', 'created_at']),
  ('lounge_members',           ARRAY['lounge_id', 'user_id', 'joined_at']),
  -- A message is not edited once said; withdrawing it is withdraw_lounge_message's, and stays.
  ('lounge_messages',          ARRAY['lounge_id', 'user_id', 'content', 'type', 'metadata', 'reply_to_id',
                                     'reply_to_content', 'reply_to_username', 'film_id', 'film_title', 'film_poster',
                                     'created_at', 'deleted_at']),
  ('log_comments',             ARRAY['log_id', 'user_id', 'created_at']),
  ('list_comments',            ARRAY['list_id', 'user_id', 'created_at']),
  ('dossier_comments_legacy',  ARRAY['dossier_id', 'user_id', 'created_at']),
  ('dispatch_dossiers_legacy', ARRAY['user_id', 'views', 'certify_count', 'created_at']),
  ('lists',                    ARRAY['user_id', 'created_at']),
  ('logs',                     ARRAY['user_id', 'created_at']),
  ('physical_archive',         ARRAY['user_id', 'created_at']),
  ('watchlists',               ARRAY['user_id', 'created_at']),
  ('notifications',            ARRAY['user_id', 'type', 'from_user_id', 'from_username', 'related_lounge_id', 'film_id',
                                     'poster_path', 'title', 'body', 'message', 'metadata', 'group_key', 'created_at']),
  -- A warning is the house's word: its member may only say it was read.
  ('warnings',                 ARRAY['user_id', 'admin_id', 'reason', 'created_at']),
  -- A salon's count is its seats', kept by recount_lounge_members.
  ('lounges',                  ARRAY['member_count', 'created_at']);

-- A column named here that the table does not have would be kept by nothing: refused.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(k.tbl || '.' || c, ', ') INTO missing
    FROM kept_columns k, unnest(k.cols) AS c
   WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns ic
                      WHERE ic.table_schema = 'public' AND ic.table_name = k.tbl AND ic.column_name = c);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'no such column to keep: %', missing; END IF;
END $$;

DO $$
DECLARE k record;
BEGIN
  FOR k IN SELECT * FROM kept_columns LOOP
    EXECUTE format('CREATE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.%I FOR EACH ROW '
                   'EXECUTE FUNCTION public.a_row_keeps_what_it_is(%s)',
                   k.tbl, (SELECT string_agg(quote_literal(c), ', ') FROM unnest(k.cols) AS c));
  END LOOP;
END $$;