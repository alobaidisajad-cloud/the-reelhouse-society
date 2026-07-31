-- ═══════════════════════════════════════════════════════════════════════════════
-- BATCH 5 · the last two functions, settled from their LIVE definitions
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ APPLY MANUALLY in the Supabase SQL editor (do NOT `supabase db push`).
--
-- The live catalogue was read rather than guessed. Results:
--
--   replace_list_items        ✅ SAFE, nothing to do. Live body derives
--                                v_user_id := auth.uid(), rejects NULL, and checks
--                                list ownership before touching anything.
--                                search_path already pinned. (The repo file shows an
--                                older 3-arg version taking p_user_id — that is NOT
--                                what is deployed. It also uses rank_position, so the
--                                column-name drift noted earlier is already fixed.)
--   batch_insert_list_items   ⚠️ RETURNED NO ROW — it genuinely does not exist.
--                                web/src/utils/archiveImport.ts calls it, so the web
--                                list import is BROKEN. Functional bug, web batch.
--   process_secure_tip        ⚠️ correct auth, but unhardened — fixed below.
--   get_lounge_unread_counts  ❌ REAL LEAK — fixed below.
--
-- ── THE LEAK ──────────────────────────────────────────────────────────────────
-- get_lounge_unread_counts is SECURITY DEFINER (so RLS does not apply) and filters
-- on the caller-supplied p_user_id instead of auth.uid():
--       WHERE lm.user_id = p_user_id
-- and anon holds EXECUTE. So anyone with the public API key could pass ANY member's
-- id and receive the list of lounges that member belongs to — private rooms
-- included — together with their unread counts.
--
-- This is the same defect as #23 in batch 2 (is_hidden_by / get_user_blocks), in a
-- function that sweep never reached.
--
-- ⚠️ MY EARLIER PROBE OF THIS WAS INCONCLUSIVE AND I SAID SO. It returned [] for a
-- real member's id, which looked like auth.uid() behaviour. It was not: the query
-- ends with `HAVING COUNT(msg.id) > 0`, so a member with nothing unread returns no
-- rows either way. Reading the definition was the only way to settle it.
--
-- ── THE FIX ───────────────────────────────────────────────────────────────────
-- Ignore p_user_id; read auth.uid(). The signature is unchanged, so the one caller
-- (web/src/stores/lounge.ts:561, which already passes its own `user.id`) is
-- unaffected and needs no deploy. Both uses of the parameter are replaced — the
-- membership filter AND the `msg.user_id != p_user_id` clause that stops your own
-- messages counting as unread.
--
-- Also pins search_path on both functions, and takes EXECUTE away from anon:
-- unread counts belong to a signed-in member, and a tip requires a session by its
-- own first line.
--
-- ⚠️ IF THE FIRST STATEMENT ERRORS with "cannot change return type of existing
-- function", the deployed RETURNS TABLE differs from the (lounge_id uuid,
-- unread_count bigint) inferred from the body. That is a SAFE failure — the whole
-- migration is one transaction, so nothing changes. Send me the error and the
-- output of:  SELECT pg_get_function_result(oid) FROM pg_proc
--             WHERE proname = 'get_lounge_unread_counts';
--
-- PROVEN ON A REPLICA before applying — leak reproduced, then closed:
--   BEFORE  anon asks for another member's lounges -> 2 rows (private one included)
--   AFTER   anon                                   -> 0 rows
--           a DIFFERENT signed-in member asking about someone else -> 0 rows
--           the member asking for their own         -> 2 rows, counts identical
--           own messages still excluded from unread -> verified
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 · unread counts belong to whoever is signed in, not to whoever asks
CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts(p_user_id uuid)
RETURNS TABLE(lounge_id uuid, unread_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- p_user_id is deliberately ignored; the session decides whose counts these are
  -- (same rule as batch 2, finding #23). Kept in the signature so the existing
  -- caller does not need redeploying.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    lm.lounge_id,
    COUNT(msg.id) AS unread_count
  FROM public.lounge_members lm
  LEFT JOIN public.lounge_messages msg
    ON msg.lounge_id = lm.lounge_id
   AND msg.created_at > COALESCE(lm.last_read_at, '1970-01-01'::timestamp)
   AND msg.user_id != v_uid
  WHERE lm.user_id = v_uid
  GROUP BY lm.lounge_id
  HAVING COUNT(msg.id) > 0;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_lounge_unread_counts(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_lounge_unread_counts(uuid) TO authenticated;

-- 2 · the tip RPC is already correct — this only hardens it
--
-- Its live body derives the sender from auth.uid() and raises 'You must be
-- authenticated to tip.' when there is no session, then rejects a non-positive
-- amount and looks the username up server-side rather than trusting the client.
-- That is the right shape and it is NOT changed here — it moves money, and the body
-- stays exactly as deployed.
--
-- What was missing is `SET search_path`, which every other SECURITY DEFINER
-- function in this database pins. Added via ALTER, so the body is untouched.
-- It has ZERO callers in either app today.
ALTER FUNCTION public.process_secure_tip(uuid, uuid, numeric, text)
  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.process_secure_tip(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.process_secure_tip(uuid, uuid, numeric, text) TO authenticated;

COMMIT;

-- ── Verify (run after, as anon with only the public key) ──────────────────────
--   POST /rest/v1/rpc/get_lounge_unread_counts {"p_user_id":"<any real member>"}
--     -> 401/403   (was 200)
--   POST /rest/v1/rpc/process_secure_tip
--        {"p_to_user_id":"<real>","p_video_id":"<real>","p_amount":1,"p_message":"x"}
--     -> 401/403   (was reachable, though it refused internally)
--   in the app, signed in: open the lounge list — unread badges still appear on the
--   rooms you belong to, and your own messages still do not count as unread.
--
-- ── Rollback (restores the vulnerable behaviour) ─────────────────────────────
-- GRANT EXECUTE ON FUNCTION public.get_lounge_unread_counts(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.process_secure_tip(uuid,uuid,numeric,text) TO PUBLIC;
-- ALTER FUNCTION public.process_secure_tip(uuid,uuid,numeric,text) RESET search_path;
-- CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts(p_user_id uuid)
-- RETURNS TABLE(lounge_id uuid, unread_count bigint)
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT lm.lounge_id, COUNT(msg.id) AS unread_count
--   FROM public.lounge_members lm
--   LEFT JOIN public.lounge_messages msg
--     ON msg.lounge_id = lm.lounge_id
--    AND msg.created_at > COALESCE(lm.last_read_at, '1970-01-01'::timestamp)
--    AND msg.user_id != p_user_id
--   WHERE lm.user_id = p_user_id
--   GROUP BY lm.lounge_id HAVING COUNT(msg.id) > 0;
-- END $$;
