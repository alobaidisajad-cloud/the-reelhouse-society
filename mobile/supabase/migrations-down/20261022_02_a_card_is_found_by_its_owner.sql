-- Undo of 20261022_02_a_card_is_found_by_its_owner.sql: production's schema as it was before it.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

DROP INDEX CONCURRENTLY IF EXISTS public.lounge_messages_card_names;
