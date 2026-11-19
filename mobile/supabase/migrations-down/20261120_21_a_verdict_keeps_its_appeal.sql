-- Undo of 20261120_21: a verdict keeps its one appeal and its lifting, undone; the cars after it are undone first.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- ── H-B6's columns, undone: a verdict keeps no appeal and no lifting; the copy of a removal held to 30,000 again ──
-- add-only (1): no shipped client uses it: rules H-B6.locks made (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_len;
-- add-only (1): no shipped client uses it: rules H-B6.locks made (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_note_len;
-- add-only (1): no shipped client uses it: rules H-B6.locks made (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_lift_reason_len;
-- add-only (1): no shipped client uses it: rules H-B6.locks made (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_status_check;
-- add-only (1): no shipped client uses it: rules H-B6.locks made (TestFlight build 41 and the website checked)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_appeal_whole;
-- add-only (1): no shipped client uses it: columns H-B6.locks made, named by neither TestFlight build 41 nor the website
ALTER TABLE public.mod_actions
  DROP COLUMN IF EXISTS appeal,
  DROP COLUMN IF EXISTS appeal_filed_at,
  DROP COLUMN IF EXISTS appeal_status,
  DROP COLUMN IF EXISTS appeal_judged_by,
  DROP COLUMN IF EXISTS appeal_judged_at,
  DROP COLUMN IF EXISTS appeal_note,
  DROP COLUMN IF EXISTS lifted_at,
  DROP COLUMN IF EXISTS lifted_by,
  DROP COLUMN IF EXISTS lift_reason;
-- add-only (3): it only fixes: the undo of H-B6.locks, the rule as it stood (TestFlight build 41 and the website never write mod_actions)
ALTER TABLE public.mod_actions DROP CONSTRAINT IF EXISTS mod_actions_content_snapshot_len;
ALTER TABLE public.mod_actions ADD CONSTRAINT mod_actions_content_snapshot_len CHECK ((char_length((content_snapshot)::text) <= 30000));
