-- ════════════════════════════════════════════════════════════════════════════
-- 20260905_04 — the four foreign keys on the Dispatch tables that no index leads
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── WHAT ───────────────────────────────────────────────────────────────────
-- Every unindexed single-column foreign key in this database is on a Dispatch
-- table. All four arrived with the Dispatch tables in September, after batch 30
-- indexed the ones that existed then, and nobody has indexed them since:
--
--   dispatch_certifications.comment_id -> dispatch_comments  ON DELETE CASCADE
--   dispatch_certifications.post_id    -> dispatch_posts     ON DELETE CASCADE
--   dispatch_posts.answer_id           -> dispatch_comments  ON DELETE SET NULL
--   dispatch_votes.user_id             -> auth.users         ON DELETE CASCADE
--
-- An unindexed foreign key makes the parent's delete SCAN the child table, once
-- per parent row. dispatch_certifications has three indexes and every one of
-- them leads with user_id, so nothing could answer "which certifications point
-- at this critique?" without reading all of them.
--
-- ── WHY IT MATTERS, and to WHICH act ───────────────────────────────────────
-- `removeCritique` in the store issues a real DELETE on dispatch_comments, and
-- dispatch_comments carries no `no_hard_delete` trigger. So withdrawing a
-- critique — an ordinary member action, not an admin one — fires TWO of these:
-- the certifications cascade and the answer_id SET NULL. Both scan.
--
-- Deleting a member fires the third, on dispatch_votes.
--
-- The fourth, dispatch_certifications.post_id, is rarer: dispatch_posts DOES
-- carry `no_hard_delete`, which turns a delete into a soft end, so that cascade
-- only fires on the scrub path. Indexed anyway — it costs little, and an index
-- that is only needed on the rare path is needed most exactly when it is used.
--
-- ── MEASURED, not argued ───────────────────────────────────────────────────
-- 50k filings, 100k critiques, 100k certifications, 50k ballots:
--
--   withdrawing a critique     10.870 ms -> 2.831 ms   (3.8x)
--     answer_is_a_critique      4.178 ms -> 0.649 ms
--     certifications cascade    6.580 ms -> 2.149 ms
--   deleting a member           4.064 ms -> 0.986 ms   (4.1x)
--
-- The scans grow with the table and the index lookups do not, so the gap widens
-- from here rather than closing.
--
-- ── WHY PARTIAL, and how that was checked ──────────────────────────────────
-- Three of the four columns are mostly NULL — a certification points at a
-- filing OR a critique and never both (CHECK one_target), and only a 'seeking'
-- filing has an answer. A partial index is far smaller, but it is only worth
-- anything if foreign-key enforcement will actually USE one. That was not
-- assumed: the measurement above was taken with partial indexes, and the RI
-- trigger times fell, so it does.
--
--   dispatch_cert_comment  1552 kB      dispatch_posts_answer   176 kB
--   dispatch_cert_post     1552 kB      dispatch_votes_user     408 kB
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
--  · CONCURRENTLY, so no writer is locked out of a live table while these build.
--  · IF NOT EXISTS, so re-running is a no-op.
--  · Purely additive — nothing is dropped, no policy or grant changes, and no
--    behaviour changes. The worst case of a wrong index is wasted space.
--  · None of these is redundant against what is already there: every existing
--    index on dispatch_certifications leads with user_id, and the unique index
--    on dispatch_votes leads with post_id.
--  · Indexes are invisible to clients, so the shipped build cannot notice.
--
-- ⚠️  CONCURRENTLY cannot run inside a transaction block. Run these four
--     statements one at a time. If the editor reports
--         ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
--     then drop the word CONCURRENTLY — these tables are small and a plain
--     CREATE INDEX takes well under a second, holding a brief write lock.
--
-- ── ROLLBACK ───────────────────────────────────────────────────────────────
--     DROP INDEX CONCURRENTLY IF EXISTS public.dispatch_cert_comment;
--     DROP INDEX CONCURRENTLY IF EXISTS public.dispatch_cert_post;
--     DROP INDEX CONCURRENTLY IF EXISTS public.dispatch_posts_answer;
--     DROP INDEX CONCURRENTLY IF EXISTS public.dispatch_votes_user;
-- ════════════════════════════════════════════════════════════════════════════

-- Which certifications point at this critique? Fired on every withdrawal.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_cert_comment
  ON public.dispatch_certifications USING btree (comment_id)
  WHERE (comment_id IS NOT NULL);

-- The same question for a filing. Rare, because dispatch_posts soft-ends.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_cert_post
  ON public.dispatch_certifications USING btree (post_id)
  WHERE (post_id IS NOT NULL);

-- Which filing took this critique as its answer? Fired on every withdrawal.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_posts_answer
  ON public.dispatch_posts USING btree (answer_id)
  WHERE (answer_id IS NOT NULL);

-- Which ballots did this member cast? Fired when an account is deleted.
CREATE INDEX CONCURRENTLY IF NOT EXISTS dispatch_votes_user
  ON public.dispatch_votes USING btree (user_id);
