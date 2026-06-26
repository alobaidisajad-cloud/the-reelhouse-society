-- ═══════════════════════════════════════════════════════════════════════════════
-- signup-collision — never let a handle clash fail signup
-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit ref: signup-collision (LOW)
--
-- WAVE 0 NOTE (verified against the live DB 2026-06-26): the LOUNGE-1 portion that
-- previously lived in this file (a find_lounge_by_invite RPC + dropping a broad
-- "Invite code lookup" policy) was REMOVED. On the live database that enumeration
-- policy does not exist — the live lounges SELECT policy is already correctly
-- scoped (is_private=false OR creator OR member), so private-lounge metadata is not
-- enumerable. The client join-by-invite was reverted to the direct lookup that
-- matches the live schema. Nothing to do for LOUNGE-1.
--
-- signup-collision (still valid): the live enforce_username_policy only renames a
-- RESERVED handle on INSERT; a non-reserved handle that collides with an existing
-- username would fail the unique index (e.g. OAuth/email-prefix signups). Extend it
-- to also append a short unique suffix on a GENERAL collision so signup never fails.
-- Verified the live function body matches this base exactly — this is a clean superset.
--
-- Idempotent. Single transaction.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_username_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  reserved text[] := ARRAY[
    'admin','administrator','mod','moderator','support','help',
    'reelhouse','system','root','official','staff','team','bot',
    'null','undefined','anonymous','anon','deleted','unknown',
    'api','www','mail','email','noreply','no_reply',
    'settings','login','signup','logout','feed','discover',
    'profile','edit','delete','create','new','user','users'
  ];
  v_norm text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.username IS NOT DISTINCT FROM OLD.username THEN
    RETURN NEW;
  END IF;

  v_norm := lower(coalesce(NEW.username, ''));

  IF TG_OP = 'UPDATE' THEN
    -- Profile edit: enforce strictly (the app validates first).
    IF v_norm = ANY(reserved) THEN
      RAISE EXCEPTION 'This username is reserved.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- INSERT (signup): never fail. Append a short unique suffix if the handle is
  -- reserved OR already taken (case-insensitive) — so the account is always created.
  IF v_norm = ANY(reserved)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_norm AND id <> NEW.id) THEN
    NEW.username := NEW.username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
