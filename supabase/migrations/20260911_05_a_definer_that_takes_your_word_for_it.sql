-- ═══════════════════════════════════════════════════════════════════════════
-- A DEFINER THAT TAKES YOUR WORD FOR IT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A SECURITY DEFINER runs with the owner's rights. One that reads `auth.uid()`
-- decides for itself who is calling. One that takes the ACTOR AS A PARAMETER
-- believes whatever it is told — and if `anon` may execute it, an anonymous
-- caller names themselves.
--
-- Eight such functions were executable by anon. Called as anon against
-- production, rolled back:
--
--   get_taste_profile(<any uuid>)            RETURNED A ROW
--   audience_allows(actor, owner, pref)      RETURNED false  (answered)
--   can_annotate_log(actor, log)             RETURNED true   (answered)
--   can_endorse_content(actor, ...)          RETURNED true   (answered)
--
-- ── WHY ONLY TWO ARE REVOKED ───────────────────────────────────────────────
-- The obvious move is to revoke all eight. It would be wrong, and the reason is
-- the whole point of studying before fixing:
--
--   can_annotate_list, can_annotate_log, can_endorse_content
--       ARE USED INSIDE RLS POLICIES (one each, checked in pg_policies). A
--       policy expression is evaluated as the querying role, so anon needs
--       EXECUTE for those policies to evaluate at all. Revoking would not
--       tighten anything — it would make legitimate reads fail. They answer a
--       boolean the policy is about to act on anyway.
--
--   get_featured_critique()
--       Public editorial content. A signed-out reader is meant to see it.
--
--   increment_dossier_views(uuid)
--       Has a LIVE CALLER on the web, which shares this database and serves
--       signed-out readers. It moves a view counter and nothing else. Breaking
--       a live page to tidy a counter is a bad trade.
--
-- ── THE TWO THAT GO ────────────────────────────────────────────────────────
--   get_taste_profile(p_user_id uuid)
--       Hands back a member's taste profile for ANY id the caller names, with
--       no reference to who is asking. This is the real leak of the eight: a
--       member's viewing character, readable by anyone with a uuid. The app
--       calls it from ProfileDataService, always signed in, so `authenticated`
--       keeps it and nothing in the product changes.
--
--   audience_allows(p_actor, p_owner, p_pref)
--       Answers "may this member see that one" for any pair. Used in no policy
--       — checked, not assumed — so nothing depends on anon holding it. Left
--       alone it is a privacy-graph oracle: an anonymous caller can map who can
--       see whom, one call at a time.
--
-- PUBLIC is named alongside anon for the reason it always is here: revoking
-- from a role while PUBLIC holds the grant reports success and changes nothing.

REVOKE EXECUTE ON FUNCTION public.get_taste_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_taste_profile(uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.audience_allows(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.audience_allows(uuid, uuid, text) FROM PUBLIC;
