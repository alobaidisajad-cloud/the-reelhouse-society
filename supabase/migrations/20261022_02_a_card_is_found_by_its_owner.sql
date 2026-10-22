-- ════════════════════════════════════════════════════════════════════════════
-- 20261022_02 — a card in a salon is found by the member it names.
-- ════════════════════════════════════════════════════════════════════════════
--   A card shared into a salon (a stack, a filing) keeps its owner's or
--   author's handle in its metadata, and a member who leaves has it taken from
--   every card (request_account_deletion, 20261016_02). Every other message
--   keeps empty metadata, so the index holds the cards alone; with none, each
--   closing account read every message of every salon.
--   Built CONCURRENTLY, so members write on while it builds: it is applied
--   alone, with apply.cjs --no-transaction, and the train checks it whole.
-- Undo: mobile/supabase/migrations-down/20261022_02_a_card_is_found_by_its_owner.sql
-- ════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '2s';
SET statement_timeout = '10min';

CREATE INDEX CONCURRENTLY IF NOT EXISTS lounge_messages_card_names ON public.lounge_messages USING gin (metadata jsonb_path_ops) WHERE metadata <> '{}'::jsonb;
