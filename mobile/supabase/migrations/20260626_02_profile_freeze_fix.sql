-- ═══════════════════════════════════════════════════════════════════════════════
-- WAVE 1 — Fix PROFILE-FREEZE-1: protect-triggers froze tier + derived counters
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: BACKEND-PROFILE-FREEZE-1 (HIGH → CRITICAL if live)
--
-- The 0002-era `protect_profile_fields` BEFORE-UPDATE trigger unconditionally
-- reverted role/tier/followers_count/following_count/total_logs on EVERY profile
-- UPDATE — with no caller guard. BEFORE triggers fire for service-role and for
-- SECURITY DEFINER trigger functions too, so:
--   • tier upgrades from sync-entitlement were reverted → premium_rls (tier-gated)
--     never passed → nobody could access premium;
--   • the follow/endorse triggers' `followers_count = followers_count + 1` updates
--     were reverted → follower/following counts frozen at 0.
-- The identical bug existed in `protect_video_review_metrics` (views/tip_total).
--
-- Fix principle:
--   1. Do NOT protect derived counters here at all. They are maintained ONLY by
--      SECURITY DEFINER triggers (handle_interaction_notification, handle_privacy_
--      switch, accept_follow_request, increment_video_*), which run under the
--      *caller's* auth.role()='authenticated' — so any auth.role() guard would
--      still freeze them. Removing them from the trigger is the only correct fix.
--   2. Protect the privilege fields (role/tier) ONLY for client (authenticated)
--      writes. service_role (sync-entitlement / paytabs / admin RPCs) → auth.role()
--      = 'service_role' → allowed. `role` is also independently guarded by
--      check_role_update (20260504); we keep a redundant revert here as
--      defense-in-depth (it runs first and silently reverts, so check_role_update
--      never needs to raise).
--
-- Triggers stay attached to the same function names; replacing the bodies is
-- sufficient. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Privilege fields: clients may never change these; service_role may.
  IF auth.role() = 'authenticated' THEN
    NEW.role := OLD.role;
    NEW.tier := OLD.tier;
  END IF;

  -- followers_count / following_count / total_logs are DERIVED counters owned by
  -- the SECURITY DEFINER interaction/privacy triggers — intentionally NOT reverted
  -- here (reverting them froze the counts). RLS already blocks clients from writing
  -- arbitrary profile columns to other users; and check_role_update covers role.

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Same surgery for video-review metrics (only relevant if projectionist features ship).
CREATE OR REPLACE FUNCTION public.protect_video_review_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Ownership identity is immutable from the client; metrics (views/tip_total) are
  -- maintained by SECURITY DEFINER triggers (increment_video_views/_tips) and must
  -- NOT be reverted here.
  IF auth.role() = 'authenticated' THEN
    NEW.user_id  := OLD.user_id;
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMIT;

-- Post-conditions to verify after COMMIT (integration test):
--   • Authenticated client UPDATE profiles SET tier='auteur' WHERE id=auth.uid()  → tier unchanged.
--   • service_role UPDATE profiles SET tier='auteur'                              → tier changes.
--   • INSERT a 'follow' interaction → target.followers_count increments by 1 (no longer frozen).
