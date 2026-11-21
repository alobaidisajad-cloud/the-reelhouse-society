-- ════════════════════════════════════════════════════════════════════════════
-- 20261120_31 — a withheld piece is gone to every reader but its author: its columns and rules.
-- ════════════════════════════════════════════════════════════════════════════
--   1. withheld_at on logs, lists and the three critiques' tables, kept from their writers (review
--      round 14).
--   2. Each piece's hiding rule leaves out a withheld piece but for its author, a filing's critiques ask
--      whether their filing can be read, and a withheld piece's marks follow it out (review round 14).
--   3. No new card of a withheld piece is written (a_piece_withheld_is_not_shared), and a withheld
--      critique takes no certification (review round 14).
--   4. The old Dispatch's tables are read by no member, and a page's picture held as evidence is never
--      deleted by its member (avatars_held_as_evidence, made only where the train's role rules
--      storage.objects, as production's postgres does) (review round 14).
--   5. A critique's rule asks its filing by its key, and the marks' rule asks no piece a mark does not
--      name (the load lab, round 14's train).
--   After 20261120_19 (the salon's rule is widened again from it) and 20261120_30, before 20261120_32
--   (which writes the columns). Every column is empty, so each rule reads as before until a piece is
--   withheld; each table is held only for the instant its catalogue changes, to the end of this car.
-- Undo: mobile/supabase/migrations-down/20261120_31_a_withheld_piece_is_read_by_its_author_alone.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B10's columns and rules · a withheld piece is gone to every reader but its author (review round 14) ──
--   A car of its own, after H-B10.table and H-B3.column (the salon's hiding rule is widened again here,
--   from H-B3.column's), and before H-B10's functions (they write the columns). Every statement here is
--   brief: each table is held only while the catalogue changes; no row is read or rewritten (each new
--   column is empty, so every rule reads as before until the house withholds a piece).
--   A REMOVE CONTENT deleted a log, a stack or a critique at once, and with them the critiques, marks
--   and notices that went with them: an appeal overturned could give back only the words. Now the
--   house withholds the piece instead (H-B10), keeping it whole until its appeal is upheld, or 30 days
--   pass unappealed, and only then deletes it as before. Withheld, it is gone to everyone but its author
--   and the Tribunal. A filing has its withheld state already (dispatch_posts.withheld_at: the paper,
--   its own reading rule and its critiques' doors leave it out); the other pieces take the same:
--   1. withheld_at on logs, lists, log_comments, list_comments and dispatch_comments; no member writes it
--      (each table's a_keeps_what_it_is keeps it; dispatch_comments' pin_columns, in H-B10);
--   2. each piece's hiding rule (the restrictive one that leaves out a hidden member's words) leaves out
--      a withheld piece too, unless the reader is its author; a stack's films and critiques, and a log's
--      critiques, follow their piece by their own rules (each asks whether its piece can be read); a
--      filing's critiques now ask whether their filing can be read;
--   3. a salon card of a withheld piece is turned gone by the house's write (H-B10, as a sealed stack's
--      cards are turned), so no reading rule asks it; and no new card of it is written, its author's
--      included (a_piece_withheld_is_not_shared, refused as gone, as the card's own rule refuses one);
--   4. a critique the house withholds takes no certification (certs_open_post);
--   5. the old Dispatch's tables, read by no client, are read by no member (a withheld or emptied essay
--      stayed readable there whole);
--   6. a page's picture held as evidence or kept to put back is never deleted by its member meanwhile
--      (avatars_held_as_evidence).

-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house withholds a piece; TestFlight build 41 and the website read these tables by named columns, replayed as the members themselves (H-B10.locks rehearsal)
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS withheld_at timestamp with time zone;
-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house withholds a piece replayed as the members themselves (H-B10.locks rehearsal)
ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS withheld_at timestamp with time zone;
-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house withholds a piece replayed as the members themselves (H-B10.locks rehearsal)
ALTER TABLE public.log_comments ADD COLUMN IF NOT EXISTS withheld_at timestamp with time zone;
-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house withholds a piece replayed as the members themselves (H-B10.locks rehearsal)
ALTER TABLE public.list_comments ADD COLUMN IF NOT EXISTS withheld_at timestamp with time zone;
-- add-only (3): it only widens: a column no shipped client names, empty for every row until the house withholds a piece replayed as the members themselves (H-B10.locks rehearsal)
ALTER TABLE public.dispatch_comments ADD COLUMN IF NOT EXISTS withheld_at timestamp with time zone;

-- A visitor reads a log's columns one by one: the new one with the rest, so a reader asking "is it withheld"
-- (member_viewings, for an open member's calendar) is answered. A visitor reads no withheld log, so reads it empty.
GRANT SELECT(withheld_at) ON TABLE public.logs TO anon;

COMMENT ON COLUMN public.logs.withheld_at IS 'Withheld by the house (a REMOVE CONTENT awaiting its appeal, withheld_pieces): read by its author alone until deleted or given back. Written by the house alone.';
COMMENT ON COLUMN public.lists.withheld_at IS 'Withheld by the house (withheld_pieces): read by its author alone until deleted or given back. Written by the house alone.';
COMMENT ON COLUMN public.log_comments.withheld_at IS 'Withheld by the house (withheld_pieces): read by its author alone until deleted or given back. Written by the house alone.';
COMMENT ON COLUMN public.list_comments.withheld_at IS 'Withheld by the house (withheld_pieces): read by its author alone until deleted or given back. Written by the house alone.';
COMMENT ON COLUMN public.dispatch_comments.withheld_at IS 'Withheld by the house (withheld_pieces): read by its author alone until deleted or given back. Written by the house alone.';

-- As the live schema has each, the withholding kept with the rest: no member unwithholds their own piece.
-- add-only (3): it only fixes: an update of one's own log keeps every column it kept, and withheld_at too; TestFlight build 41 and the website never write the column, replayed as the members themselves (H-B10.locks rehearsal)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'created_at', 'withheld_at');
-- add-only (3): it only fixes: an update of one's own stack keeps every column it kept, and withheld_at too replayed as the members themselves (H-B10.locks rehearsal)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'created_at', 'withheld_at');
-- add-only (3): it only fixes: an update of one's own critique keeps every column it kept, and withheld_at too replayed as the members themselves (H-B10.locks rehearsal)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('log_id', 'user_id', 'created_at', 'withheld_at');
-- add-only (3): it only fixes: an update of one's own critique keeps every column it kept, and withheld_at too replayed as the members themselves (H-B10.locks rehearsal)
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.list_comments FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('list_id', 'user_id', 'created_at', 'withheld_at');

-- No card of a withheld piece is written into a salon, by anyone, its author too: refused as the card's own
-- rule refuses a piece gone (LOG_GONE, STACK_GONE, PIECE_GONE), before it (by name, a_p before a_s).
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_piece_withheld_is_not_shared ON public.lounge_messages;
-- add-only (1): no shipped client uses it: a trigger's function this piece makes, dropped first only so the piece runs again, called by no client (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_piece_withheld_is_not_shared();
CREATE FUNCTION private.a_piece_withheld_is_not_shared() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_named text := CASE NEW.type
    WHEN 'log_share'     THEN coalesce(NEW.metadata ->> 'log_id', NEW.metadata ->> 'logId')
    WHEN 'list_share'    THEN NEW.metadata ->> 'listId'
    WHEN 'dossier_share' THEN coalesce(NEW.metadata ->> 'dossier_id', NEW.metadata ->> 'dossierId')
  END;
  v_withheld boolean;
BEGIN
  IF v_named IS NULL OR v_named !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  -- Read as the house, whoever shares: the sharer may be the piece's author, who alone still reads it.
  v_withheld := CASE NEW.type
       WHEN 'log_share'     THEN EXISTS (SELECT 1 FROM public.logs l WHERE l.id = v_named::uuid AND l.withheld_at IS NOT NULL)
       WHEN 'list_share'    THEN EXISTS (SELECT 1 FROM public.lists s WHERE s.id = v_named::uuid AND s.withheld_at IS NOT NULL)
       WHEN 'dossier_share' THEN EXISTS (SELECT 1 FROM public.dispatch_posts d WHERE d.id = v_named::uuid AND d.withheld_at IS NOT NULL)
       ELSE false
     END;
  IF v_withheld THEN
    RAISE EXCEPTION '%', CASE NEW.type WHEN 'log_share' THEN 'LOG_GONE' WHEN 'list_share' THEN 'STACK_GONE' ELSE 'PIECE_GONE' END
      USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END $$;
-- add-only (1): no shipped client uses it: a trigger's function, new here; TestFlight build 41 and the website never call it
REVOKE ALL ON FUNCTION private.a_piece_withheld_is_not_shared() FROM PUBLIC, anon, authenticated;
-- add-only (3): it only fixes: a card of a piece the house withholds is refused as gone, every other message written as before; replayed as the members themselves (H-B10 rehearsal)
CREATE OR REPLACE TRIGGER a_piece_withheld_is_not_shared
  BEFORE INSERT ON public.lounge_messages
  FOR EACH ROW
  WHEN (NEW.type = ANY (ARRAY['log_share'::text, 'list_share'::text, 'dossier_share'::text]))
  EXECUTE FUNCTION private.a_piece_withheld_is_not_shared();

-- In the schema the API never serves (H-A5's private): asked by the reading rules alone, never by a member.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, asked by the critiques' reading rules alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_withheld_piece_holds_it(text, uuid);
CREATE FUNCTION private.a_withheld_piece_holds_it(p_kind text, p_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- Whether a critique's piece is withheld from the reader (withheld, and not theirs): its critiques go
  -- with it, the critic's own too (a critique's own reading rule lets its writer read it anywhere).
  SELECT coalesce(CASE p_kind
           WHEN 'log'  THEN (SELECT l.withheld_at IS NOT NULL AND l.user_id IS DISTINCT FROM (SELECT auth.uid()) FROM public.logs l WHERE l.id = p_id)
           WHEN 'list' THEN (SELECT s.withheld_at IS NOT NULL AND s.user_id IS DISTINCT FROM (SELECT auth.uid()) FROM public.lists s WHERE s.id = p_id)
         END, false)
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the critiques' reading rules as the reader (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_withheld_piece_holds_it(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_withheld_piece_holds_it(text, uuid) TO anon, authenticated, service_role;

-- As 20261116_01 made it, a withheld log left out too, unless the reader is its author.
-- add-only (3): it only fixes: every log read as before but one the house withholds, empty for every row until H-B10 withholds one; TestFlight build 41 and the website read logs through this rule, replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
ALTER POLICY logs_hide_blocked ON public.logs
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((withheld_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));
-- As 20261116_01 made it, a withheld stack left out too, unless the reader is its curator.
-- add-only (3): it only fixes: every stack read as before but one the house withholds replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
ALTER POLICY lists_hide_blocked ON public.lists
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((withheld_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))));
-- As the live schema has it, a withheld critique left out too, unless the reader wrote it, and a critique
-- of a piece withheld from the reader with its piece.
-- add-only (3): it only fixes: every critique read as before but one the house withholds, or under a piece withheld replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
ALTER POLICY log_comments_hide_blocked ON public.log_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((withheld_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
     AND (NOT private.a_withheld_piece_holds_it('log'::text, log_id)));
-- add-only (3): it only fixes: every critique read as before but one the house withholds, or under a piece withheld replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
ALTER POLICY list_comments_hide_blocked ON public.list_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((withheld_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
     AND (NOT private.a_withheld_piece_holds_it('list'::text, list_id)));
-- As the live schema has it, a withheld critique left out too, and a critique of a filing the reader
-- cannot read (withheld, or by one hidden from them) with its filing. The filing is asked by its key, one
-- row: as EXISTS, the planner hashed every filing the reader may read (40,000, 16 ms) for a page of 30.
-- add-only (3): it only fixes: every critique of a filing read as before but one withheld, or under a filing withheld replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
ALTER POLICY critiques_block ON public.dispatch_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false))
     AND ((withheld_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
     AND ((post_id IS NULL) OR COALESCE(( SELECT true AS readable FROM public.dispatch_posts p WHERE (p.id = dispatch_comments.post_id)), false)));
-- A mark on a withheld log or stack goes with its piece: read by the piece's author alone meanwhile.
-- Restrictive, beside the marks' one reading rule (interactions_select_authorized, which it narrows only).
-- A piece a mark does not name is not asked of (no piece of no id is withheld).
-- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
DROP POLICY IF EXISTS interactions_withheld_marks ON public.interactions;
-- add-only (3): it only fixes: every interaction read as before but a mark on a piece the house withholds, read by its author alone replayed as the members themselves (H-B10.locks and H-B10 rehearsals)
CREATE POLICY interactions_withheld_marks ON public.interactions AS RESTRICTIVE FOR SELECT TO authenticated, anon
  USING (((type <> ALL (ARRAY['endorse_log'::text, 'endorse_list'::text]))
       OR ((NOT ((target_log_id IS NOT NULL) AND private.a_withheld_piece_holds_it('log'::text, target_log_id)))
           AND (NOT ((target_list_id IS NOT NULL) AND private.a_withheld_piece_holds_it('list'::text, target_list_id))))));

-- A critique the house withholds takes no certification meanwhile, as its filing does not: the critique is
-- asked as the certifier reads it (withheld, or of a filing they cannot read, it is not theirs to mark).
-- add-only (3): it only fixes: every certification written as before but one of a critique the house withholds, or one the certifier cannot read; TestFlight build 41 and the website certify through this rule, replayed as the members themselves (H-B10.locks rehearsal)
ALTER POLICY certs_open_post ON public.dispatch_certifications
  WITH CHECK (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.dispatch_posts p
  WHERE ((p.id = dispatch_certifications.post_id) AND (p.ended_at IS NULL) AND (p.withheld_at IS NULL)))))
     AND ((comment_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.dispatch_comments c
  WHERE ((c.id = dispatch_certifications.comment_id) AND (c.withheld_at IS NULL))))));

-- The old Dispatch's tables (before September): copies of every old essay and critique, with the ids the
-- house still reports and removes by. No client reads them (the phone and the website read the Dispatch
-- through its views, dispatch_dossiers, dossier_comments and dossier_certifications, over the new tables;
-- no shipped source ever named a _legacy table in a read), and the house's own functions read them as
-- the house. A withheld or emptied essay stayed readable here whole; now no member or visitor reads them.
-- add-only (3): it only narrows a read no client makes: TestFlight build 41 and the website read the Dispatch through its views over dispatch_posts, never this table (git history checked: no source ever read it), replayed as the members themselves (H-B10.locks rehearsal)
REVOKE SELECT ON TABLE public.dispatch_dossiers_legacy FROM anon, authenticated;
-- add-only (3): it only narrows a read no client makes: the views over dispatch_comments are what every client reads (git history checked) replayed as the members themselves (H-B10.locks rehearsal)
REVOKE SELECT ON TABLE public.dossier_comments_legacy FROM anon, authenticated;
-- add-only (3): it only narrows a read no client makes: the view over dispatch_certifications is what every client reads (git history checked) replayed as the members themselves (H-B10.locks rehearsal)
REVOKE SELECT ON TABLE public.dossier_certifications_legacy FROM anon, authenticated;

-- A picture the Tribunal holds as evidence (a page's picture as reported, a report still pending), or keeps
-- to put back (a page cleared by a verdict whose appeal may still be heard), is never deleted by its
-- member meanwhile: a new picture's upload once deleted the old file, and the exhibit then showed nothing.
-- add-only (1): no shipped client uses it: a function this piece makes, dropped first only so the piece runs again, asked by the pictures' delete rule alone (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_picture_is_held(text, text);
CREATE FUNCTION private.a_picture_is_held(p_bucket text, p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  -- A page's picture is kept in the bucket under its member's folder; asked by that member's key of the
  -- reports still pending about their page (their words as reported) and of the verdicts that cleared it
  -- (what puts it back), each by its own index.
  SELECT p_bucket = 'avatars' AND split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND (
    EXISTS (SELECT 1 FROM public.reports r JOIN public.reported_words w ON w.report_id = r.id
             WHERE r.status = 'pending' AND r.content_type = 'profile' AND r.content_id = split_part(p_name, '/', 1)
               AND position(('/avatars/' || p_name) IN coalesce(w.words ->> 'avatar_url', '')) > 0)
    OR EXISTS (SELECT 1 FROM public.mod_actions m
                WHERE m.target_user_id = split_part(p_name, '/', 1)::uuid AND m.action = 'delete_content'
                  AND coalesce(m.appeal_status, 'pending') = 'pending'
                  AND position(('/avatars/' || p_name) IN coalesce(m.content_snapshot -> 'kept' ->> 'avatar_url', '')) > 0))
$$;
-- add-only (1): no shipped client uses it: a function this piece makes, asked by the pictures' delete rule as the member (TestFlight build 41 and the website checked)
REVOKE ALL ON FUNCTION private.a_picture_is_held(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.a_picture_is_held(text, text) TO authenticated, service_role;
-- The rule is made where the runner manages the pictures' table, as production's postgres does (20260927_01
-- made the avatars' rules there); a copy whose storage is a stand-in owned by another (CI's: no row
-- security on it, and none of the rules this one narrows) is told so and left as it is. Either way the car
-- records what it did on the rule's function: no note where it made the rule; where it did not, a note
-- naming the role that applied it, which did not rule storage, so the rehearsal reads the car's own
-- answer whichever role rehearses it (CI applies as postgres and rehearses as Supabase's stand-in).
-- add-only (3): it only fixes: every picture a member deletes is deleted as before but one the Tribunal holds as evidence or keeps to put back, which stays; replayed as the members themselves (H-B10.locks.storage proof)
DO $do$
BEGIN
  IF pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = 'storage.objects'::regclass), 'USAGE') THEN
    -- add-only (1): no shipped client uses it: a rule this piece makes, dropped first only so the piece runs again (TestFlight build 41 and the website checked)
    EXECUTE 'DROP POLICY IF EXISTS avatars_held_as_evidence ON storage.objects';
    -- add-only (3): it only fixes: every picture a member deletes is deleted as before but one the Tribunal holds as evidence or keeps to put back, which stays (the phone's purge of old pictures leaves it, as it leaves the current one); replayed as the members themselves (H-B10.locks.storage proof)
    EXECUTE $p$CREATE POLICY avatars_held_as_evidence ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
      USING ((bucket_id <> 'avatars'::text) OR (NOT private.a_picture_is_held(bucket_id, name)))$p$;
    EXECUTE 'COMMENT ON FUNCTION private.a_picture_is_held(text, text) IS NULL';
  ELSE
    RAISE NOTICE 'storage.objects is not this runner''s to rule: avatars_held_as_evidence is not made on this copy';
    EXECUTE format('COMMENT ON FUNCTION private.a_picture_is_held(text, text) IS %L',
      format('avatars_held_as_evidence is not made: storage.objects is not %s''s to rule', current_user));
  END IF;
END
$do$;

-- The new columns' statistics, gathered now: adding a column changes no row, so nothing else gathers
-- them soon. With none, the planner reads `withheld_at IS NULL` as rare when it holds for nearly every
-- piece, and the feed, a film's pages and search read every row for a page of twenty.
ANALYZE public.logs (withheld_at), public.lists (withheld_at), public.log_comments (withheld_at),
  public.list_comments (withheld_at), public.dispatch_comments (withheld_at);
