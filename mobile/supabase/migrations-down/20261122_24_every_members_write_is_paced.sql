-- Undo of 20261122_24: every write a member can repeat at will is paced, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- add-only (3): it only fixes: the undo takes the rule off each table, as the cars before it left them
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.lists;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.list_items;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.dispatch_posts;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.lounges;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.lounge_message_reactions;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.dispatch_certifications;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.dispatch_saves;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.dispatch_votes;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.user_blocks;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.watchlists;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.physical_archive;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.member_drafts;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.push_subscriptions;
DROP TRIGGER IF EXISTS zz_a_write_is_paced ON public.lounge_members;
-- add-only (1): no shipped client uses it: the trigger's function and the house's own table this car made, read by no client
DROP FUNCTION IF EXISTS public.check_write_pace();
DROP TABLE IF EXISTS public.write_budget;
