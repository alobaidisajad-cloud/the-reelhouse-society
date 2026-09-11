-- ═══════════════════════════════════════════════════════════════════════════
-- YOUR OWN VOICE IS NOT UNREAD
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `get_lounge_unread_counts()` counted the member's OWN messages as unread.
-- Executed against production as a real member, inside a rolled-back
-- transaction, before touching anything:
--
--     get_lounge_unread_counts()            -> 3
--     get_lounge_unread_counts(p_user_id)   -> 2      (the dead overload)
--     messages that member wrote themselves -> 1
--     messages written by others            -> 2
--
-- Three, for two messages somebody else sent. The filter asks only whether a
-- message is newer than `last_read_at`; it never asks who wrote it.
--
-- ── WHY IT SHOWS, AND WHY IT SHOWS ON THE DISPATCH'S PATH ───────────────────
-- `last_read_at` moves only when a member OPENS a room. `ShareToLoungeModal`
-- does not touch it. So sharing an essay into a lounge you are not currently
-- looking at raises your own unread badge, over your own share. The member is
-- told they have something to read, by themselves, about a thing they just did.
--
-- ── THE FIX WAS ALREADY WRITTEN, IN THE FUNCTION NOBODY CALLS ───────────────
-- A second overload, `get_lounge_unread_counts(p_user_id uuid)`, has been live
-- and unreferenced this whole time, and it carries exactly the missing clause:
-- `AND msg.user_id != v_uid`. The correct implementation existed; the app was
-- wired to the other one. (`audit/findings/backend.md` even documents the
-- exclusion as though it were true of the live function — it describes the dead
-- one.)
--
-- ── WHAT IS DELIBERATELY KEPT ──────────────────────────────────────────────
-- · `last_message_at` stays a MAX over ALL messages, the member's own included.
--   It orders the room list by activity; a room you just spoke in has just been
--   active. It is not an unread count and must not inherit the exclusion.
-- · No `HAVING`. The store reads `last_message_at` for EVERY room it is in, so
--   a room with nothing unread must still return a row. The dead overload has
--   `HAVING COUNT(...) > 0` and would have broken ordering if adopted directly.
-- · SECURITY INVOKER. This reads only through RLS as the calling member, and it
--   should stay that way; the dead one is SECURITY DEFINER and takes a
--   `p_user_id` it then ignores in favour of `auth.uid()` — a parameter that
--   invites a caller to believe they can ask about somebody else.

CREATE OR REPLACE FUNCTION public.get_lounge_unread_counts()
  RETURNS TABLE(lounge_id uuid, unread_count bigint, last_message_at timestamp with time zone)
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  WITH my_rooms AS (
    SELECT lm.lounge_id, lm.last_read_at
      FROM public.lounge_members lm
     WHERE lm.user_id = auth.uid()
  )
  SELECT
    r.lounge_id,
    COUNT(m.id) FILTER (
      -- Somebody ELSE said it, and they said it after you last looked.
      WHERE m.user_id <> auth.uid()
        AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    ) AS unread_count,
    MAX(m.created_at) AS last_message_at
  FROM my_rooms r
  LEFT JOIN public.lounge_messages m ON m.lounge_id = r.lounge_id
  GROUP BY r.lounge_id;
$function$;

-- ── AND THE OVERLOAD GOES ──────────────────────────────────────────────────
-- Two functions of the same name is why `check:backend` cannot pin a signature
-- for it: pinning one of two invents drift on every run. Established dead before
-- dropping, not assumed:
--   · no call site in the mobile app (the store calls the no-arg form)
--   · no call site in the web app, which shares this database
--   · no edge function references it
--   · no other function, view or trigger calls it
--   · `cron.job` holds exactly one job, `freeze-closed-ballots`, unrelated
--   · an earlier audit reached the same conclusion independently
--     (`audit/ALL-FINDINGS-FULL.md`: "already live and unused")
DROP FUNCTION IF EXISTS public.get_lounge_unread_counts(uuid);
