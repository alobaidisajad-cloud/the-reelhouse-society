-- Undo of 20261126_00_a_stacks_films_are_read_in_their_order.sql: the index of a stack's films in their order goes.
SET lock_timeout = '2s';
SET statement_timeout = '10min';

DROP INDEX CONCURRENTLY IF EXISTS public.list_items_in_order;
