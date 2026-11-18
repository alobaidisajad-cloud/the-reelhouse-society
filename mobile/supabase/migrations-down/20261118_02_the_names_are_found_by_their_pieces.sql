-- Undo of 20261118_02: the names' trigram index is dropped, CONCURRENTLY, alone, as it was built;
-- search_members (20261118_01) then reads the names without it, the same rows, slower.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

DROP INDEX CONCURRENTLY IF EXISTS public.profiles_display_name_trigram;
