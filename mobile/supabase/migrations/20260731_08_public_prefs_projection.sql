-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 5 · #7 — close the `preferences` leak properly (SQL + both clients)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ APPLIED TO PRODUCTION 2026-07-31 — verified live as anon:
--    public_prefs across all 32 members exposes ONLY whitelisted keys
--    (favorites, social_visibility, privacy_annotations, privacy_endorsements,
--    programmes). Zero off-whitelist keys; no notif_*, no onboarded.
--    All five real query shapes return 200:
--      frozen TestFlight profile query (preferences-> paths)  -> 200
--      launch-build profile query (public_prefs)              -> 200
--      web UserProfilePage / FeedPage join / LogDetailPage    -> 200
--    STEP 4 (the revoke) has NOT been run — it waits for the launch build.
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
-- ⚠️ Run this AFTER 20260731_07. This migration is PURELY ADDITIVE — it creates a
--    function and a column and grants them. NOTHING loses access here. The revoke
--    that actually closes the leak is STEP 4 at the bottom, and it must not run
--    until the launch build ships. The reason is proven, not assumed:
--
--    THE MOBILE APP IS BROWSABLE LOGGED OUT. There is no auth guard on the tab
--    layout; login is a MODAL — app/(tabs)/profile.tsx:33 renders a sign-in prompt
--    and app/(tabs)/reels.tsx:421 a gate CTA, so a session is required for ACTIONS,
--    not for browsing. A logged-out member can therefore open user/[username],
--    which fetches PUBLIC_PROFILE_COLUMNS — and that string contains
--    `programmes:preferences->programmes`.
--
--    Proven on a replica: a JSONB path read STILL REQUIRES column-level SELECT on
--    the underlying column.
--        GRANT SELECT (id) only  ->  SELECT prefs->'programmes'  ->  42501
--        after GRANT SELECT (prefs) ->  ["p"]
--    Because PostgREST sends the whole column list as one SELECT, revoking
--    `preferences` from `anon` today would not merely blank three fields — it would
--    fail the ENTIRE profile fetch, and the profile screen would break for every
--    logged-out visitor on the frozen TestFlight build.
--
-- ── WHAT LEAKS TODAY ──────────────────────────────────────────────────────────
-- Measured live 2026-07-31: anon reads the raw `preferences` JSONB of all 32
-- members. Keys present, with how many members carry each:
--     onboarded(19)  favorites(6)  notif_system(3)  notif_follows(3)
--     notif_comments(3)  notif_endorsements(3)  social_visibility(3)
--     privacy_annotations(3)  privacy_endorsements(3)  programmes(1)
-- The app exposes only programmes / favorites / hide_stats. The service's own
-- comment (src/services/ProfileDataService.ts:50) says PUBLIC_PROFILE_COLUMNS
-- exists "to prevent leaking user settings ... to other users" — a promise the
-- database never enforced. The register filed this as "non-sensitive"; it is not.
-- A member's notification habits and, worse, their own privacy configuration are
-- readable by anyone holding the public anon key.
--
-- ── THE FIX: A WHITELIST PROJECTION ───────────────────────────────────────────
-- A generated column that contains ONLY the keys other members are meant to see.
-- Whitelist, never blacklist: a preference key added in future is PRIVATE BY
-- DEFAULT and cannot leak by omission.
--
-- Why a user-defined function rather than an inline expression: a generated column
-- requires an IMMUTABLE expression, and `jsonb_build_object` is only STABLE
-- (verified: pg_proc.provolatile = 's'), so the obvious formulation is rejected
-- with "generation expression is not immutable". `jsonb_object_agg` IS immutable
-- (verified: provolatile = 'i'), so the wrapper below is honestly labelled — it is
-- not an IMMUTABLE lie told to satisfy the planner.
--
-- ⚠️ MAINTENANCE TRAP, stated plainly: the column is STORED (production is PG 17.6;
-- VIRTUAL generated columns need PG 18). Editing public_prefs()'s body does NOT
-- recompute existing rows. After ANY change to the whitelist, force a rewrite:
--     ALTER TABLE public.profiles ALTER COLUMN public_prefs DROP EXPRESSION;
--     ALTER TABLE public.profiles DROP COLUMN public_prefs;
--     -- then re-run step 2 below.
-- Verified on a replica that ordinary UPDATEs to `preferences` DO refresh the
-- column correctly; only a change to the function body goes stale.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · the whitelist. Anything not named here is private.
--
-- programmes / favorites / hide_stats     — rendered on the public profile
-- privacy_annotations / privacy_endorsements / social_visibility
--     — policy settings a VIEWER's client must read to decide whether to offer
--       the endorse/annotate affordance. They describe what others may do, so they
--       are necessarily visible to others. (Client-side enforcement of these is
--       weak by nature; enforcing them server-side is a separate concern and is
--       NOT made worse by this change.)
CREATE OR REPLACE FUNCTION public.public_prefs(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT COALESCE(jsonb_object_agg(k, p -> k), '{}'::jsonb)
  FROM unnest(ARRAY[
    'programmes',
    'favorites',
    'hide_stats',
    'privacy_annotations',
    'privacy_endorsements',
    'social_visibility'
  ]) AS k
  WHERE p ? k;
$$;

COMMENT ON FUNCTION public.public_prefs(jsonb) IS
  'Whitelist projection of profiles.preferences. Keys NOT listed here are private '
  'and must never be exposed to another member. Changing this body does not '
  'recompute the STORED generated column — drop and recreate the column.';

-- 2 · the projection itself
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_prefs jsonb
  GENERATED ALWAYS AS (public.public_prefs(preferences)) STORED;

-- 3 · grant it explicitly.
--
-- ⚠️ THIS LINE IS NOT OPTIONAL — it is finding #34 in action. `profiles` is under
-- COLUMN-level grants, so a newly added column is readable by NOBODY until it is
-- granted. Without this, every client reading public_prefs would get 42501.
GRANT SELECT (public_prefs) ON public.profiles TO anon, authenticated;

COMMIT;

-- ── Verify (run after, as anon) ───────────────────────────────────────────────
--   GET /rest/v1/profiles?select=public_prefs&limit=5
--     -> 200, and every object contains ONLY keys from the whitelist above.
--        No notif_*, no onboarded.
--   GET /rest/v1/profiles?select=preferences&limit=1
--     -> 200 STILL (deliberately — see step 4).
--   In the app, logged OUT: open another member's profile. Programmes, favourites
--   and the hidden-stats behaviour must be unchanged.
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- STEP 4 — THE ACTUAL CLOSURE. DO NOT RUN THIS YET.
-- ═══════════════════════════════════════════════════════════════════════════════
-- Run ONLY once BOTH of these are true:
--   (a) the web app has been redeployed with the public_prefs changes
--       (UserProfilePage.tsx, FeedPage.tsx, LogDetailPage.tsx), and
--   (b) the launch build is live and the frozen TestFlight build is retired
--       (mobile PUBLIC_PROFILE_COLUMNS now selects public_prefs).
--
--   REVOKE SELECT (preferences) ON public.profiles FROM anon;
--
-- That closes it for anonymous callers — the real threat, since the anon key ships
-- inside both clients and is effectively public.
--
-- CLOSING IT FOR SIGNED-IN MEMBERS TOO is a further step and needs one more change,
-- because a member must still read their OWN preferences and RLS cannot distinguish
-- self from other at COLUMN level (RLS filters rows, never columns). The owner's
-- read must move off the column first:
--
--   CREATE OR REPLACE FUNCTION public.get_my_preferences()
--   RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $$ SELECT preferences FROM public.profiles WHERE id = auth.uid() $$;
--   REVOKE EXECUTE ON FUNCTION public.get_my_preferences() FROM PUBLIC, anon;
--   -- ^ both revokes are required; Postgres grants EXECUTE to PUBLIC by default.
--   GRANT EXECUTE ON FUNCTION public.get_my_preferences() TO authenticated;
--   -- then, after the clients read their own prefs through that RPC:
--   REVOKE SELECT (preferences) ON public.profiles FROM authenticated;
--
-- That is a client change on BOTH apps (mobile SELF_PROFILE_COLUMNS and
-- PROFILE_SELECT_COLUMNS, web stores/auth.ts:134,181) and belongs with the launch
-- build, not before it.
--
-- ── Rollback (this migration only) ────────────────────────────────────────────
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS public_prefs;
-- DROP FUNCTION IF EXISTS public.public_prefs(jsonb);
