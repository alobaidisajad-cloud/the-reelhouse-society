-- ════════════════════════════════════════════════════════════════════════════
-- 20261111_02 — a salon's members, found in the order they joined.
-- ════════════════════════════════════════════════════════════════════════════
--   The corridor draws three faces for each of a member's salons
--   (get_salon_member_faces, made to stop at the third by 20261111_04). This
--   index holds each salon's approved members in the order they joined, so the
--   three are its first entries, never a salon's whole roster ranked. Measured at
--   500,000 members (load 42969529684, then 43019778229 with it): the corridor
--   for a member in 200 rooms, 93.9 ms -> 24.8 ms.
--   Built CONCURRENTLY, so members write on while it builds: it is applied
--   alone, outside any transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261111_02_the_faces_are_found_in_order.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lounge_members_faces ON public.lounge_members USING btree (lounge_id, joined_at, user_id) WHERE status = 'approved';
