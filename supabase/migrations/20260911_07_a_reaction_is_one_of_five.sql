-- ═══════════════════════════════════════════════════════════════════════════
-- A reaction is one of five, and the database is what says so
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The client offers five reactions: bravo, adored, riveting, quoted, panned.
-- The column was plain `text` with a single CHECK capping it at 100 characters.
-- Nothing restricted the VALUE. Any client speaking to PostgREST directly could
-- write an arbitrary 100-character string as a reaction.
--
-- It would not have stayed invisible. Both summarizeReactions and
-- applyReactionDelta order reactions with LOUNGE_REACTIONS.indexOf(...), and
-- indexOf returns -1 for a value not in the list — so an unknown reaction sorts
-- BEFORE every real one. An arbitrary string would have rendered at the head of
-- the reaction row on that message, for every member who opened the room.
--
-- The client-side ordering is fixed too, but that fix alone would be theatre:
-- the client cannot stop a direct insert. The constraint is the real repair,
-- and the ordering fix is the defence behind it.
--
-- Rehearsed against production inside BEGIN/ROLLBACK first:
--   rows violating the new rule .... 0   (only 'quoted' exists live)
--   constraint adds ................ yes
--   a curated reaction ............. accepted
--   an arbitrary string ............ REFUSED
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lounge_message_reactions
  ADD CONSTRAINT lounge_message_reactions_reaction_curated
  CHECK (reaction IN ('bravo', 'adored', 'riveting', 'quoted', 'panned'));

COMMENT ON CONSTRAINT lounge_message_reactions_reaction_curated
  ON public.lounge_message_reactions IS
  'The five curated reactions. Kept in step with LOUNGE_REACTIONS in src/stores/lounge.ts; '
  'a guard test asserts the two lists are identical, so adding one here without the other fails the build.';
