-- ═══════════════════════════════════════════════════════════════════════════
-- AN UNFINISHED ESSAY SURVIVES THE PHONE.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Four thousand words currently live in exactly one place: MMKV on one handset.
-- A lost phone, a stolen phone, a cracked screen, a reinstall, or "I deleted the
-- app to free up space" takes every one of them. That is not a multi-device
-- problem — it is the fact that a member's unpublished writing has NO BACKUP.
--
-- ── WHAT THIS CHANGES ABOUT THE HOUSE, WHICH IS THE REAL DECISION ──────────
-- Until now an unfinished essay never left the member's phone. It does now, and
-- clause VI of the house rules is amended in the same change to say so:
--
--     What you keep is yours and is never shown, finished or not.
--
-- `everyRuleIsTrue` exists so a clause cannot quietly stop being true. A schema
-- change that makes a promise false is not a schema change, it is a broken
-- promise with a migration attached.
--
-- ── ONLY THE ESSAY ────────────────────────────────────────────────────────
-- A dossier and an amend of one. Not the log — it carries PRIVATE NOTES, the
-- most sensitive thing this app holds, and a log takes two minutes to rewrite.
-- Not a critique, not a ballot, for the same reason: minutes, not evenings. The
-- essay is the only place where an hour of irreplaceable work exists, and the
-- only thing worth changing a promise for.
--
-- ── DELETION IS THE FOREIGN KEY, NOT A LINE IN A LIST ─────────────────────
-- `handle_user_deletion` is six hand-written DELETEs. A new table would not be
-- on it — precisely the "a list somebody has to remember" fault that left four
-- draft keys on members' phones through every logout this app has ever done.
-- ON DELETE CASCADE off `profiles` makes it structural instead.

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_drafts (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  -- The filing an amend belongs to. NOT NULL DEFAULT '' rather than nullable:
  -- nulls are not equal to one another in a primary key, so an upsert on an
  -- unscoped draft would silently write a SECOND row on every push instead of
  -- replacing the first.
  scope      text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL,
  -- The MEMBER's clock — when they last typed. This is what decides a conflict,
  -- because "which of these did the writer touch most recently" is the question,
  -- not "which reached the server first".
  saved_at   timestamptz NOT NULL,
  -- The SERVER's clock, kept honest by the trigger below. Never used to resolve
  -- a conflict; it exists so the house can see how old a row is.
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT member_drafts_pkey PRIMARY KEY (user_id, kind, scope),
  -- Named, so a typo cannot create a junk row that nothing will ever read.
  CONSTRAINT member_drafts_kind CHECK (kind IN ('dossier', 'edit')),
  -- The essay is 25,000, plus a title, a film and a series with JSON around
  -- them. The client refuses to push anything larger; this is what makes that
  -- refusal true rather than polite.
  CONSTRAINT member_drafts_ceiling CHECK (char_length(payload::text) <= 30000),
  CONSTRAINT member_drafts_scope_len CHECK (char_length(scope) <= 100)
);

COMMENT ON TABLE public.member_drafts IS
  'A member''s unfinished essay, so a lost phone does not take it. Owner-only at '
  'the row level and readable by nobody else, including the house''s own screens. '
  'See clause VI of the house rules, which was amended alongside this table.';

-- The server's own clock, and it cannot be set by a client.
DROP TRIGGER IF EXISTS set_member_drafts_updated_at ON public.member_drafts;
CREATE TRIGGER set_member_drafts_updated_at
  BEFORE UPDATE ON public.member_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.member_drafts ENABLE ROW LEVEL SECURITY;

-- ── FOUR POLICIES, SCOPED TO `authenticated` ───────────────────────────────
-- The nearest thing in this schema — `log_private_notes` — leaves its four at
-- `{public}`, which includes anon, and is safe only because `auth.uid()` is null
-- for an anonymous caller so no row matches. Safe by accident is not safe: this
-- app has already found one live leak that way, on the lounge.
DROP POLICY IF EXISTS md_select ON public.member_drafts;
CREATE POLICY md_select ON public.member_drafts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS md_insert ON public.member_drafts;
CREATE POLICY md_insert ON public.member_drafts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS md_update ON public.member_drafts;
CREATE POLICY md_update ON public.member_drafts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS md_delete ON public.member_drafts;
CREATE POLICY md_delete ON public.member_drafts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- PUBLIC first, then the grant. Revoking from `anon` alone does nothing:
-- Postgres grants to PUBLIC and anon is in PUBLIC — the mistake that left
-- `end_filing` open to an anonymous caller after a REVOKE that reported success.
REVOKE ALL ON TABLE public.member_drafts FROM PUBLIC;
REVOKE ALL ON TABLE public.member_drafts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_drafts TO authenticated;
GRANT ALL ON TABLE public.member_drafts TO service_role;

COMMIT;

-- ── PROVE IT ───────────────────────────────────────────────────────────────
--   -- 1. A member reads their own and NOBODY else's:
--   BEGIN;
--   SET LOCAL request.jwt.claims = '{"sub":"<member A>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   INSERT INTO public.member_drafts (user_id, kind, payload, saved_at)
--   VALUES ('<member A>', 'dossier', '{"title":"x"}'::jsonb, now());
--   RESET ROLE;
--   SET LOCAL request.jwt.claims = '{"sub":"<member B>","role":"authenticated"}';
--   SET LOCAL ROLE authenticated;
--   SELECT count(*) FROM public.member_drafts;          -- expect: 0
--   ROLLBACK;
--
--   -- 2. Anonymous reads nothing at all:
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM public.member_drafts;          -- expect: permission denied
--   ROLLBACK;
--
--   -- 3. The ceiling refuses:
--   BEGIN;
--   INSERT INTO public.member_drafts (user_id, kind, payload, saved_at)
--   VALUES ('<member A>', 'dossier',
--           jsonb_build_object('c', repeat('x', 30001)), now());   -- expect: violates check
--   ROLLBACK;
--
--   -- 4. Deleting the profile takes the draft:
--   --    (structural — the FK, not a line in handle_user_deletion)
