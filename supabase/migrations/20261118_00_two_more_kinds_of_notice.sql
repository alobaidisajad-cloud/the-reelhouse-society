-- ════════════════════════════════════════════════════════════════════════════
-- 20261118_00 — two more kinds of notice: a salon's, and a ballot's close.
-- ════════════════════════════════════════════════════════════════════════════
--   20261118_01 writes a salon's request and admission as 'salon', and a ballot's close as 'ballot'
--   (its G-B6 and G-B4). The notices' rule allows only the kinds written before, so it is widened
--   first, in a car of its own: a car is applied whole before the next is rehearsed, so the writers
--   never meet the old rule. The new rule is added NOT VALID: it checks every notice written from
--   here on, and holds the notices whole (ACCESS EXCLUSIVE) only for its two statements, never
--   reading the 2.5 million written before; 20261118_01 gives those their kinds and proves the rule
--   over every one (VALIDATE CONSTRAINT), under a lock no member's read or write waits on.
-- Undo: mobile/supabase/migrations-down/20261118_00_two_more_kinds_of_notice.sql
-- ════════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- G-B6's kinds, a car of their own before the functions that write them: the rule is changed without
-- reading the notices (NOT VALID), so it holds them whole (ACCESS EXCLUSIVE) for an instant; the
-- notices written before are given their kind, and the rule is proved over every one of them, by
-- 20261118_01, under locks no member's read or write waits on.
-- add-only (3): it only widens: the same kinds with two more, put back at once by the next statement; every notice written before is one of them, replayed as the members (G-B6 and the kinds' rehearsals)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- add-only (3): it only widens: the kinds the house wrote before, every one still allowed, with 'salon' and 'ballot' added; checked on each notice written from here on, and proved over the notices before by 20261118_01 (VALIDATE); replayed as the members (G-B6 and the kinds' rehearsals)
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['follow'::text, 'endorse'::text, 'comment'::text, 'annotate'::text, 'retransmit'::text, 'system'::text, 'reaction'::text, 'follow_request'::text, 'follow_accept'::text, 'moderation'::text, 'featured'::text, 'salon'::text, 'ballot'::text]))) NOT VALID;
