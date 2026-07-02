-- ═══════════════════════════════════════════════════════════════════════════════
-- MEMBER Nº — the real, permanent Society membership number
-- ═══════════════════════════════════════════════════════════════════════════════
-- Every member gets a true serial number by join order:
--   • Backfill: existing members numbered by created_at (earliest = lowest —
--     your founders get the relic numbers retroactively).
--   • Sequence: new signups are stamped with the next number at the moment of
--     admission via a column DEFAULT — no trigger changes needed.
--   • Numbers are NEVER reused and NEVER shift: deleting member #5 leaves a
--     permanent gap, exactly like a real 1924 ledger.
--   • profiles SELECT is already public via RLS, so the number renders on any
--     member's dossier with zero policy changes.
-- Idempotent — safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════
BEGIN;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS member_no integer;

-- Backfill by join order (ties broken by id for determinism)
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.profiles
)
UPDATE public.profiles p
SET member_no = o.rn
FROM ordered o
WHERE p.id = o.id AND p.member_no IS NULL;

-- The admission stamp for all future members
CREATE SEQUENCE IF NOT EXISTS public.member_no_seq;
SELECT setval('public.member_no_seq', COALESCE((SELECT max(member_no) FROM public.profiles), 0));
ALTER TABLE public.profiles ALTER COLUMN member_no SET DEFAULT nextval('public.member_no_seq');

-- One number, one member, forever
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_member_no ON public.profiles (member_no);

COMMIT;

NOTIFY pgrst, 'reload schema';
