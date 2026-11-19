-- Undo of 20261120_31: a withheld piece is gone to every reader but its author: its columns and rules, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B10's columns and rules, undone: each rule and trigger as it stood, the columns and the card's test gone ──
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as 20261116_01 made it
ALTER POLICY logs_hide_blocked ON public.logs
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as 20261116_01 made it
ALTER POLICY lists_hide_blocked ON public.lists
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as the live schema has it
ALTER POLICY log_comments_hide_blocked ON public.log_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as the live schema has it
ALTER POLICY list_comments_hide_blocked ON public.list_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as the live schema has it
ALTER POLICY critiques_block ON public.dispatch_comments
  USING ((NOT COALESCE((user_id = ANY (( SELECT private.hidden_authors() AS hidden_authors)::uuid[])), false)));
-- add-only (3): it only fixes: the undo of H-B10.locks, the rule as the live schema has it
ALTER POLICY certs_open_post ON public.dispatch_certifications
  WITH CHECK (((post_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.dispatch_posts p
  WHERE ((p.id = dispatch_certifications.post_id) AND (p.ended_at IS NULL) AND (p.withheld_at IS NULL))))));
-- add-only (3): it only fixes: the undo of H-B10.locks, the grants as the live schema has them
GRANT SELECT ON TABLE public.dispatch_dossiers_legacy TO anon, authenticated;
-- add-only (3): it only fixes: the undo of H-B10.locks
GRANT SELECT ON TABLE public.dossier_comments_legacy TO anon, authenticated;
-- add-only (3): it only fixes: the undo of H-B10.locks
GRANT SELECT ON TABLE public.dossier_certifications_legacy TO anon, authenticated;
-- add-only (1): no shipped client uses it: a trigger H-B10.locks made (TestFlight build 41 and the website checked)
DROP TRIGGER IF EXISTS a_piece_withheld_is_not_shared ON public.lounge_messages;
-- add-only (1): no shipped client uses it: a function H-B10.locks made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_piece_withheld_is_not_shared();
-- add-only (1): no shipped client uses it: a rule H-B10.locks made, where it made it (TestFlight build 41 and the website checked)
DO $do$
BEGIN
  IF pg_has_role(current_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = 'storage.objects'::regclass), 'USAGE') THEN
    EXECUTE 'DROP POLICY IF EXISTS avatars_held_as_evidence ON storage.objects';
  END IF;
END
$do$;
-- add-only (1): no shipped client uses it: a function H-B10.locks made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_picture_is_held(text, text);
-- add-only (1): no shipped client uses it: a rule H-B10.locks made (TestFlight build 41 and the website checked)
DROP POLICY IF EXISTS interactions_withheld_marks ON public.interactions;
-- add-only (1): no shipped client uses it: a function H-B10.locks made (TestFlight build 41 and the website checked)
DROP FUNCTION IF EXISTS private.a_withheld_piece_holds_it(text, uuid);
-- add-only (3): it only fixes: the undo of H-B10.locks, each trigger as the live schema has it
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.logs FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'created_at');
-- add-only (3): it only fixes: the undo of H-B10.locks
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.lists FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('user_id', 'created_at');
-- add-only (3): it only fixes: the undo of H-B10.locks
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.log_comments FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('log_id', 'user_id', 'created_at');
-- add-only (3): it only fixes: the undo of H-B10.locks
CREATE OR REPLACE TRIGGER a_keeps_what_it_is BEFORE UPDATE ON public.list_comments FOR EACH ROW EXECUTE FUNCTION public.a_row_keeps_what_it_is('list_id', 'user_id', 'created_at');
-- add-only (1): no shipped client uses it: columns H-B10.locks made, named by neither TestFlight build 41 nor the website
ALTER TABLE public.logs DROP COLUMN IF EXISTS withheld_at;
-- add-only (1): no shipped client uses it: columns H-B10.locks made
ALTER TABLE public.lists DROP COLUMN IF EXISTS withheld_at;
-- add-only (1): no shipped client uses it: columns H-B10.locks made
ALTER TABLE public.log_comments DROP COLUMN IF EXISTS withheld_at;
-- add-only (1): no shipped client uses it: columns H-B10.locks made
ALTER TABLE public.list_comments DROP COLUMN IF EXISTS withheld_at;
-- add-only (1): no shipped client uses it: columns H-B10.locks made
ALTER TABLE public.dispatch_comments DROP COLUMN IF EXISTS withheld_at;
