-- ═══════════════════════════════════════════════════════════════════════════════
-- Repair 5 — make "who can certify / annotate" real (logs + stacks)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- The settings panel promises control over who can certify (endorse) and annotate
-- (comment on) your content, but nothing enforced it. This adds the enforcement at
-- the database boundary — the only place it can't be bypassed.
--
-- Method (chosen from the live policy audit): every target table already carries a
-- RESTRICTIVE ban_block_*_insert policy that AND's on top of the permissive inserts.
-- We follow that exact pattern and ADD one RESTRICTIVE INSERT gate per table. Because
-- RESTRICTIVE policies AND with everything, this cannot be defeated by a leftover
-- permissive policy, and it leaves every existing SELECT/UPDATE/DELETE/INSERT policy
-- untouched (no risk of dropping owner access). Follows, follow_requests, and film/
-- review endorsements are unaffected — only endorse_log / endorse_list and comments
-- are gated.
--
-- Semantics (per product decision):
--   • everyone  → anyone may act
--   • followers → only approved followers (type='follow') may act
--   • nobody    → no OTHER member may act
--   • the owner may ALWAYS act on their own content
--   • default when unset → 'everyone'
--
-- Gated content types: logs + stacks (log_comments, list_comments, endorse_log,
-- endorse_list). Preferences live in profiles.preferences JSONB. Helper functions
-- are SECURITY DEFINER so they read the owner's pref + follow graph without tripping
-- RLS recursion, and STABLE so they're cheap inside a WITH CHECK.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Helper: audience test against an owner's preference + follow graph ──────────
CREATE OR REPLACE FUNCTION public.audience_allows(p_actor uuid, p_owner uuid, p_pref text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_owner IS NULL THEN TRUE               -- content vanished; let FKs decide
    WHEN p_actor = p_owner THEN TRUE             -- owner may always act on own content
    WHEN COALESCE(p_pref, 'everyone') = 'everyone' THEN TRUE
    WHEN COALESCE(p_pref, 'everyone') = 'nobody' THEN FALSE
    ELSE EXISTS (                                -- 'followers': approved follow only
      SELECT 1 FROM public.interactions
      WHERE type = 'follow' AND user_id = p_actor AND target_user_id = p_owner
    )
  END;
$$;

-- ── Annotate (comment) gates ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_annotate_log(p_actor uuid, p_log_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.audience_allows(
    p_actor, l.user_id,
    (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id)
  )
  FROM public.logs l WHERE l.id = p_log_id;
$$;

CREATE OR REPLACE FUNCTION public.can_annotate_list(p_actor uuid, p_list_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.audience_allows(
    p_actor, l.user_id,
    (SELECT preferences->>'privacy_annotations' FROM public.profiles WHERE id = l.user_id)
  )
  FROM public.lists l WHERE l.id = p_list_id;
$$;

-- ── Certify (endorse) gate — logs + stacks only ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_endorse_content(p_actor uuid, p_type text, p_log_id uuid, p_list_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid;
  v_pref  text;
BEGIN
  IF p_type = 'endorse_log' THEN
    SELECT user_id INTO v_owner FROM public.logs WHERE id = p_log_id;
  ELSIF p_type = 'endorse_list' THEN
    SELECT user_id INTO v_owner FROM public.lists WHERE id = p_list_id;
  ELSE
    RETURN TRUE; -- not a gated endorsement type
  END IF;
  SELECT preferences->>'privacy_endorsements' INTO v_pref FROM public.profiles WHERE id = v_owner;
  RETURN public.audience_allows(p_actor, v_owner, v_pref);
END;
$$;

-- Helpers return null-safe booleans; a null (e.g. missing row) must not open the gate.
-- The COALESCE in each policy guards that: null → false → the restrictive gate blocks.

-- ── The restrictive INSERT gates (AND with existing permissive + ban_block) ─────
DROP POLICY IF EXISTS log_comments_annotate_gate ON public.log_comments;
CREATE POLICY log_comments_annotate_gate ON public.log_comments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (COALESCE(public.can_annotate_log(auth.uid(), log_id), false));

DROP POLICY IF EXISTS list_comments_annotate_gate ON public.list_comments;
CREATE POLICY list_comments_annotate_gate ON public.list_comments
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (COALESCE(public.can_annotate_list(auth.uid(), list_id), false));

DROP POLICY IF EXISTS interactions_endorse_gate ON public.interactions;
CREATE POLICY interactions_endorse_gate ON public.interactions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    type NOT IN ('endorse_log', 'endorse_list')
    OR COALESCE(public.can_endorse_content(auth.uid(), type, target_log_id, target_list_id), false)
  );

COMMIT;

-- ── Verify (run after) ─────────────────────────────────────────────────────────
-- 1. Gates present as RESTRICTIVE INSERT policies:
--    SELECT tablename, policyname, permissive, cmd FROM pg_policies
--    WHERE schemaname='public' AND policyname LIKE '%_gate' ORDER BY tablename;
-- 2. Owner can always comment on own log (should return true):
--    SELECT public.can_annotate_log('<owner-uuid>'::uuid, '<their-log-uuid>'::uuid);
-- 3. A stranger against a 'nobody' log (should return false):
--    SELECT public.can_annotate_log('<stranger-uuid>'::uuid, '<nobody-pref-log-uuid>'::uuid);
