-- ============================================================================
-- BATCH 27 · #93 — no server-side length cap on any comment column
-- ============================================================================
--
-- Every comment column is bare `text`. The only thing keeping a comment a
-- reasonable size is the client, and the client is not the authority: anyone
-- with the anon key and a HTTP client can write a megabyte into a log comment.
--
-- What that actually costs, verified rather than assumed:
--   • comments render in a plain <Text> with NO line limit, so an oversized one
--     is laid out in full on every reader's device — this is not the quadratic
--     markdown path that forced the dossier cap in batch 21, but it is not free;
--   • it ships in the payload of every fetch of that log, list or dossier;
--   • `reports.details` is worse in kind than in size: it is the field the
--     Tribunal is GUARANTEED to render hostile input from.
--
-- The client caps ARE wired — all six write sites call sanitizeInput, which
-- TRUNCATES (`clean.slice(0, maxLen)`) rather than merely measuring. So no
-- legitimate write can be rejected by these constraints. This is defence in
-- depth against a crafted request, not a repair of normal use.
--
-- ── WHY UPPER BOUND ONLY ────────────────────────────────────────────────────
-- The obvious shape — and the one this schema already uses on private_notes —
-- is `CHECK (length(x) BETWEEN 1 AND N)`. That would BREAK the app here:
-- `lounge_messages.content` defaults to '' because a film-share message carries
-- no text, and `reports.details` defaults to '' for a report filed without a
-- note. A lower bound would reject both.
--
-- ── WHY THESE NUMBERS ───────────────────────────────────────────────────────
-- Taken from MAX_LENGTHS in src/utils/sanitizeInput.ts, not invented. A server
-- cap that silently disagrees with the client's is worse than none — it rejects
-- writes the app believes are valid. A test asserts the two agree, so raising
-- one without the other fails CI rather than surfacing as a member losing a
-- comment they just typed.
--
-- ── SAFE TO VALIDATE IMMEDIATELY ────────────────────────────────────────────
-- Checked live before writing this, longest value per column:
--     log_comments.body       104 / 2000     (7 rows)
--     list_comments.content     4 / 1000     (1 row)
--     dossier_comments.body     7 / 2000     (1 row)
--     lounge_messages.content 271 / 2000    (10 rows)
--     reports.details        (none) / 500    (0 rows)
-- Everything is far inside its cap, so these validate on creation. Had anything
-- exceeded, these would have gone in NOT VALID instead — an ADD CONSTRAINT that
-- fails halfway is how a migration leaves a schema half-changed.
--
-- Idempotent: ADD CONSTRAINT has no IF NOT EXISTS, so each is guarded. Safe to
-- re-run.
-- ============================================================================

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('log_comments',     'body',    'log_comments_body_len',     2000),
      ('list_comments',    'content', 'list_comments_content_len', 1000),
      ('dossier_comments', 'body',    'dossier_comments_body_len', 2000),
      ('lounge_messages',  'content', 'lounge_messages_content_len', 2000),
      ('reports',          'details', 'reports_details_len',        500)
    ) AS t(tbl, col, cname, cap)
  LOOP
    -- The table must exist and not already carry this constraint.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint pc
      JOIN pg_class pcl ON pcl.oid = pc.conrelid
      JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
      WHERE pn.nspname = 'public' AND pcl.relname = c.tbl AND pc.conname = c.cname
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = c.tbl AND column_name = c.col
    ) THEN
      EXECUTE format(
        -- NULL passes deliberately: a nullable column with no value is not an
        -- oversized one, and NOT NULL is a separate decision already made per
        -- column. `char_length` counts characters, not bytes.
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(%I) <= %s)',
        c.tbl, c.cname, c.col, c.cap
      );
      RAISE NOTICE 'added % on %.%  (<= %)', c.cname, c.tbl, c.col, c.cap;
    ELSE
      RAISE NOTICE 'skipped % (already present, or column missing)', c.cname;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- VERIFY (read-only)
-- ============================================================================
-- 1 · all five constraints exist and are VALIDATED (convalidated = true):
--     SELECT pcl.relname, pc.conname, pc.convalidated,
--            pg_get_constraintdef(pc.oid) AS definition
--       FROM pg_constraint pc
--       JOIN pg_class pcl ON pcl.oid = pc.conrelid
--       JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
--      WHERE pn.nspname = 'public' AND pc.conname LIKE '%\_len'
--      ORDER BY 1;
--
-- 2 · an oversized comment is now REFUSED (expect 23514 check_violation):
--     INSERT INTO public.log_comments (log_id, user_id, username, body)
--     VALUES (gen_random_uuid(), gen_random_uuid(), 'x', repeat('a', 2001));
--
-- 3 · and an EMPTY lounge message still inserts, which a lower bound would have
--     broken — film shares carry no text:
--     INSERT INTO public.lounge_messages (lounge_id, user_id, content)
--     VALUES (gen_random_uuid(), gen_random_uuid(), '');
