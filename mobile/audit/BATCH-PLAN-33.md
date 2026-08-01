# ReelHouse — The 33 Batches

**This file is the single definition of what a batch number means.** "Study batch 7"
means the findings under **BATCH 7** here — nothing else. Open this file first.
Never infer a batch from memory.

**One batch at a time. A batch is finished when its own DONE WHEN line is true —
not when the surrounding work "feels" finished.** There are no phases in this plan
on purpose: nothing groups batches together, so nothing invites doing several at
once. Batch 4 does not begin until batch 3 is committed and pushed.

Written 2026-07-31. Launch target: **iOS and Android together**
(`ANDROID_LAUNCH.md`, decided 2026-07-13).

---

## The register

| | Count |
|---|---|
| Register entries (`audit/REGISTER-124.txt`) | **124** |
| Not findings — #9 withdrawn, #15 intentional, #133 a clean-bill statement, #196 a stray table row | 4 |
| **Tier A — DONE** (13 deletions + 16 in-place edits) | **29** |
| **Open findings, placed across the 33 batches below** | **91** |

The register is **124, not 131**. `all-131-findings.txt` holds 118 entries, the
master write-up holds 100, the union is 124. Numbers 10, 16–22, 66 and 97 were never
used. "131" is a label, not a count.

## Why the order is what it is

Risk first. Batches 1–9 are live security: two of the three true blockers, and the
private-notes leaks are exposing real members on the live database **today** — the
web app shares that backend. Batch 10 is test integrity, because it hardens the gate
that guards everything after it. Batches 11–25 are behaviour. Batches 26–33 are
backend hygiene and launch verification.

**Do not reorder without saying why.** Two hard dependencies: batch 12 needs batch 6
done first, and batch 33 needs the Android §1 config tasks already complete.

**Start the Android §1 config now, in parallel** (Play Console, RevenueCat Android
key, FCM). External lead time, no code, no batch slot — batch 33 only verifies it.

## How every batch runs

1. **Study** — open each finding, confirm it still exists in the code, confirm it is
   not a false positive. *Batch 2 shipped two.* Check the premise, not just the fix.
2. **Test first** — a test that fails against current code.
3. **Fix** — the smallest change that makes it pass.
4. **Mutation-verify** — break the fix on purpose; confirm the right test fails.
   *Repo files are CRLF: a mutation using `\n` matching silently does nothing and
   fakes a pass. Always print a before/after count of the mutated token.*
5. **Gate** — `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci
   --coverage` + `node scripts/coverage-ratchet.js`.
6. **Ship** — commit and push to `main`.

**Tier C also needs:** a live probe before, the SQL pasted inline in chat (never a
file path, never `db push`), a written rollback, and a live probe after.

**Size caps** — 6 for one subsystem cluster sharing a test harness, 3 for unrelated
findings, 1 for anything touching RLS or a live function, 2 for additive SQL
hygiene. From evidence: batch 2 was 16, shipped two false positives, and took three
audit passes.

---

## BATCH 1 · The private-notes leak
`Tier C` · `2 findings` · `no dependency` · **✅ DONE 2026-07-31**

- **#26** — BLOCKING · "Notes only you can see" are readable by anyone on the internet.
- **#32** — High · A second, independent leak of the same private notes that ignores RLS entirely.

**Together because** closing one alone leaves the data exposed by the other. They are
one exposure with two doors.

**DONE WHEN** a live probe as an anonymous caller returns no private note through
either path, the probe output is in the commit, and a rollback is written.

---

## BATCH 2 · Block-system privacy leak
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-07-31**

- **#23** — High · The function trusts a caller-supplied `viewer_id`. All 8 call sites already pass `auth.uid()`, so it can ignore the parameter and use `auth.uid()` internally.

**DONE WHEN** a live probe proves a forged `viewer_id` cannot read another member's
block state, and all 8 call sites are confirmed unaffected.

---

## BATCH 3 · Account deletion
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-07-31**

- **#42** — BLOCKING · "Delete Account" deletes nothing.

**Alone because** it is an App Store rejection risk on its own — Apple requires
working account deletion for any app with signup — and it cannot be fixed from the
client.

**DONE WHEN** a test account is deleted and a live probe confirms every table that
held its rows is empty of them.

---

## BATCH 4 · Blocking is one-directional
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-07-31**

- **#113** — High · The blocked member can still see and reach the blocker.

**DONE WHEN** a live probe from the blocked side returns nothing in both directions.

---

## BATCH 5 · The REST exposure surface
`Tier C` · `3 findings` · `no dependency` · **✅ DONE 2026-07-31** (web deploy pending)

- **#7** — `preferences` JSONB readable via raw REST.
  **CONFIRMED, and MISFILED in the register as "non-sensitive".** Anon reads the raw
  JSONB: 8 keys beyond the 3 the app exposes, including the member's own
  notification settings and privacy configuration.
  **FIXED — SQL + both clients.** `public.public_prefs(jsonb)` (IMMUTABLE, whitelist)
  + a STORED generated column `profiles.public_prefs`, granted to anon/authenticated.
  Web now reads it (`UserProfilePage`, `FeedPage`, `LogDetailPage` — deployable now);
  mobile `PUBLIC_PROFILE_COLUMNS` reads it in the launch build. Whitelist, so any
  future preference key is **private by default** — proven on a replica.
  **The revoke is sequenced, not skipped:** `REVOKE SELECT (preferences) FROM anon`
  is STEP 4 in the migration and must wait for the launch build, because the mobile
  app is **browsable logged out** (no auth guard on the tabs; login is a modal) and
  a JSONB path read still needs column-level SELECT — so revoking today would fail
  the entire profile fetch for logged-out visitors on the frozen build.
- **#27** — Anonymous access is inconsistent with the app's own rule.
  **LARGELY INTENTIONAL — the finding overstated it.** RLS on logs/lists/watchlists is
  already `can_view_user_data`-based; anon sees a lot only because **all 32 members are
  public** (`is_social_private` = true on ZERO profiles). Proven on a replica that a
  private member IS correctly hidden. Real residue: `can_view_user_data` **fails open**
  on a nonexistent uuid (confirmed live → `true`). Fixed here.
- **#34** — The profiles grant list is a point-in-time snapshot.
  **CONFIRMED, has NOT sprung** (only `email` is denied). Mechanism is worse than
  filed: under column grants `SELECT *` fails entirely with 42501. Recorded as a
  batch-32 invariant; nothing to repair today.

**FOUND BY THIS BATCH, not in the register:** 13 columns sat outside the app's own
curated public list, including the whole moderation surface (`ban_reason`,
`banned_at`, `suspended_until`, `suspension_reason`, `warning_count`). All zero
today — the first ban would have published its own reason worldwide. **Nine columns
revoked from `anon`;** `authenticated` untouched, so no client path changes.

**ALSO FOUND — CRITICAL, and worse than the three findings this batch was about.**
Finishing the SECURITY DEFINER sweep batch 2 started uncovered a NULL-comparison
auth bypass in six functions: `IF auth.uid() <> v_creator THEN RAISE` never fires
for a caller with no session, because `NULL <> x` is NULL, not TRUE. All six are
SECURITY DEFINER (RLS cannot catch it) and all six were still callable by `anon`
via the default PUBLIC grant. Confirmed live: a stranger holding only the public
API key could remove any member from any lounge, ban or mute anyone, admit
themselves into any PRIVATE lounge, delete any member's messages, and read any
member's analytics. Fixed and **verified live — all six now 401**.
Migration: `supabase/migrations/20260731_09_null_auth_bypass.sql`.
`get_user_analytics`'s 109-line body was deliberately left untouched; the revoke
closes it, and an earlier draft that rebuilt it had silently zeroed both streaks.

**Migration:** `supabase/migrations/20260731_07_batch5_rest_exposure.sql`
(verified end-to-end on a PostgreSQL 18.4 replica: production grant shape reproduced,
migration applied, anon loses exactly the nine, `is_banned` filtering still works,
`authenticated` unchanged, rollback exact.)

**DONE WHEN** an anonymous REST call returns only what the app's own rule permits,
proven per table. — **Met for `profiles` except `preferences` (launch build);
`logs`/`lists`/`watchlists` already correct by design.**

---

## BATCH 6 · Server-side entitlement enforcement
`Tier C` · `2 findings` · `no dependency` · **BLOCKS BATCH 12** · **✅ DONE 2026-08-01**

- **#125** — High · Paid-tier features are gated in the client only — two proven bypasses.
- **#123** — High · The Auteur gate on publishing a dossier is client-side only.

**Together because** both are the same missing server-side entitlement check.
**Must precede batch 12** or that batch is theatre — tightening the client while the
server stays open only moves the bypass.

**DONE WHEN** both proven bypasses are re-run against the live backend and rejected.

---

## BATCH 7 · Ban enforcement
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#80** — High · Incomplete in both layers, and the client gate is dead code.

**DONE WHEN** a banned test account is refused by the server, proven live, and the
dead client gate is either wired or removed — decided, not left ambiguous.

---

## BATCH 8 · Committed API key
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#65** — High · The TMDB API key is committed to git and shipped in the web bundle.

**Alone because** it is a rotation, not a deletion. Removing it from the code does
nothing while the old key is still valid.

**DONE WHEN** the old key is revoked at TMDB, the new key is not in the repo, and the
app still fetches.

---

## BATCH 9 · The bio-rename trigger
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#36** — High · Editing your bio silently renames you. **5 of 32 live members are already affected.**

**Alone because** it is a trigger fix *plus* a data repair on live rows.

**DONE WHEN** the trigger no longer touches the username, and the 5 affected members
are repaired — each one named in the commit.

---

## BATCH 10 · Test integrity
`Tier B` · `4 findings` · `no dependency` · **DO BEFORE 11–25** · **NOT STARTED**

- **#131** — High · Test files are excluded from type-checking.
- **#132** — High · Coverage thresholds sit at 7–29%, so the ratchet cannot catch regressions.
- **#1** — High · 32 lint warnings, which hide real ones.
- **#6** — Low · Jest teardown warning.

**First because** this is the gate that guards batches 11–25. Every later batch is
verified by a gate that currently does not type-check its own tests.

**DONE WHEN** tests are type-checked, the ratchet fails on a deliberate coverage
drop, and the warning count is zero.

---

## BATCH 11 · Block & mute enforcement in the client
`Tier B` · `6 findings` · `after batch 4` · **NOT STARTED**

- **#92** — Blocking someone doesn't hide their comments on three detail screens.
- **#105** — Blocking inside a salon leaves their messages on screen while the toast says they're hidden.
- **#106** — Log comments have no block filtering at any layer.
- **#114** — Stack comments have no block filtering at any layer.
- **#112** — Notifications ignore block and mute entirely.
- **#118** — The stack action sheet stays open after Block or Mute.

**Together because** this is one defect in six places. One test harness proves all
six; six separate batches would rebuild it six times.

**DONE WHEN** one blocked account is invisible across all six surfaces, each proven
by a rendering test.

---

## BATCH 12 · Purchases & tier resolution
`Tier B` · `6 findings` · **REQUIRES BATCH 6** · **NOT STARTED**

- **#47** — "Restore Purchases" silently strips admin privileges, permanently.
- **#48** — The admin account resolves to the *lowest* tier; unknown tier values downgrade silently.
- **#99** — Tapping "Restore Purchases" offline locally demotes a paying member.
- **#100** — Buying a founding seat after the cap fills says "Welcome to the Founding Board!"
- **#101** — The restore handler uses the one function the codebase warns against for `tier`.
- **#98** — The founding banner shows a hardcoded `$49` to every storefront.

**Together because** they are one subsystem with one shared tier-resolution path.

**DONE WHEN** an admin survives a restore, an offline restore changes nothing, an
unknown tier value never downgrades, and the price comes from the store.

---

## BATCH 13 · Dates & time
`Tier B` · `4 findings` · `no dependency` · **NOT STARTED**

- **#40** — High · Log dates default to the UTC calendar date, not the member's local date.
- **#74** — High · Every logged date renders one day early for users west of UTC.
- **#75** — Three `timeAgo` implementations, two of which were supposed to be deleted.
- **#109** — A local `timeAgo` in `log/[id].tsx` duplicating the shared util.

**Together because** all four are the same timezone/duplication story. **Encode the
timezone table as assertions before touching anything** — this is the batch most
likely to look right and be wrong.

**DONE WHEN** a member west of UTC sees the correct date, proven across a table of
timezones, and one `timeAgo` implementation remains.

---

## BATCH 14 · Sanitisation & link safety
`Tier B` · `4 findings` · `no dependency` · **NOT STARTED**

- **#68** — High · List titles and descriptions are the only user input bypassing the sanitizer.
- **#104** — High · Dossier comments skip sanitisation on the online path; the offline path sanitises.
- **#103** — High · Markdown links bypass the app's URL scheme allowlist, including on third-party RSS content.
- **#2** — Cap dossier markdown render length.

**Together because** they are one input-trust boundary.

**DONE WHEN** a hostile payload is rejected at every one of the four entry points, each
with its own test.

---

## BATCH 15 · Profile identity & counts
`Tier B` · `4 findings` · `no dependency` · **NOT STARTED**

- **#86** — High · Your own profile shows "WATCHLIST 0" while the tab beside it shows the real count.
- **#87** — High · Renaming your handle strands you on "Member Not Found" — for your own profile.
- **#50** — High · Signup can silently assign you a different username than you chose.
- **#46** — High · Every member's stacks show "4 FILMS" to everyone except themselves.

**Together because** all four are identity-and-count resolution on the profile.

**DONE WHEN** counts match their tabs, a rename keeps you on your own profile, and
signup assigns the chosen name or fails loudly.

---

## BATCH 16 · Follow & offline social
`Tier B` · `4 findings` · `no dependency` · **NOT STARTED**

- **#67** — High · Five of 32 live members cannot be followed at all.
- **#77** — Following someone while offline is silently discarded.
- **#78** — An offline unfollow leaves a pending follow request standing.
- **#82** — High · Following someone doesn't refresh the feed — their content stays invisible.

**Together because** one follow path, one offline queue.

**DONE WHEN** all 32 live members can be followed, and an offline follow/unfollow
survives a reconnect — proven by driving the queue.

---

## BATCH 17 · Notifications
`Tier B` · `2 findings` · `after batch 11` · **NOT STARTED**

- **#51** — High · Receiving one notification silently deletes up to 450 already-loaded ones.
- **#73** — High · Notification grouping is completely inert — a copy change broke the parser.

**DONE WHEN** an incoming notification preserves the loaded list, and grouping is
pinned by a test that fails if the copy changes again.

---

## BATCH 18 · Lounge
`Tier B` · `4 findings` · `no dependency` · **NOT STARTED**

- **#54** — High · Unread counts recomputed client-side with unbounded queries, duplicating a deployed RPC.
- **#55** — High · Lounge message loading swallows every backend error, silently.
- **#57** — `loadMoreMessages` pages on a bare `created_at` cursor.
- **#58** — A failed lounge creation still burns the 30-second cooldown.

**DONE WHEN** unread counts come from the RPC, a backend failure surfaces, and paging
cannot skip or repeat a message.

---

## BATCH 19 · Search
`Tier B` · `3 findings` · `no dependency` · **NOT STARTED**

- **#84** — Blocking · The LOGS tab can never return a result — `logs.username` and `logs.role` do not exist.
- **#85** — High · `escapeSearchPattern`'s wildcard escaping is a no-op at 5 of 6 call sites, and its quote escaping enables filter breakout.
- **#35** — At-the-Door search returns arbitrary results past 500 matching members.

**DONE WHEN** the LOGS tab returns real results, and a filter-breakout payload is
proven inert at all 6 call sites.

---

## BATCH 20 · Queries & limits
`Tier B` · `6 findings` · `no dependency` · **NOT STARTED**

- **#44** — `getLogComments` has no limit.
- **#128** — Log and dossier comment fetches are unbounded; the stack equivalent is capped.
- **#52** — `_hasMore` is computed from the salvaged array, so one bad row ends pagination.
- **#63** — The endorsement index is capped at 500, so old certifications render as un-certified.
- **#45** — The stacks feed ships ~7× the data it renders.
- **#94** — N+1 on the Tribunal: one query per report card.

**Together because** all six are the same bounded-query discipline.

**DONE WHEN** every listed fetch is bounded, and one malformed row no longer ends
pagination.

---

## BATCH 21 · Dossier publishing
`Tier B` · `3 findings` · `no dependency` · **NOT STARTED**

- **#122** — High · Essays over ~4,200 words are silently truncated on publish, **and the draft is deleted**.
- **#60** — High · An offline-composed dossier appears twice in the Dispatch feed.
- **#12** — The zip-bomb guard.

**DONE WHEN** a 6,000-word essay publishes whole or fails without destroying the
draft, and an offline dossier appears exactly once.

---

## BATCH 22 · Log screen polish
`Tier B` · `5 findings` · `no dependency` · **NOT STARTED**

- **#89** — High · Screen readers announce "Film logged to your archive" when the log failed.
- **#90** — Two stacked error toasts for one failed log.
- **#91** — `handleLog`'s dismissal timer has no unmount cleanup.
- **#107** — A blank screen as the loading state.
- **#111** — Magic-number coupling at `log/[id].tsx:645`.

**DONE WHEN** a failed log announces failure, shows one toast, and unmounting mid-
flight leaks nothing.

---

## BATCH 23 · Store hygiene & lifecycle
`Tier B` · `3 findings` · `no dependency` · **NOT STARTED**

- **#62** — `_watchlistPromises` is never garbage-collected.
- **#64** — The film-store logout reset leaves the previous user's pagination state.
- **#39** — The stack endorsement count is viewer-dependent.

**DONE WHEN** a logout leaves no trace of the previous member in the store, proven by
driving a real logout.

---

## BATCH 24 · Dead code & fabricated data
`Tier B` · `3 findings` · `no dependency` · **NOT STARTED**

- **#5** — Remove dead artifacts (`test-app/`, `test_db.js`, `test_schema.js`).
- **#127** — High · `DossierService.ts` is dead code, and its tests give false confidence in logic that never ships.
- **#41** — The news feed fabricates two articles with faked recent dates and dead links.

**#41 ships fake content to real members** — it is not cleanup, it is a correctness
fix that happens to sit beside two.

**DONE WHEN** nothing references the deleted code, and the feed shows only real
articles.

---

## BATCH 25 · The remaining singles
`Tier B` · `5 findings` · `no dependency` · **NOT STARTED**

- **#11** — `skipped` is mislabeled: the logs path counts watches, the UI says otherwise.
- **#13** — `FilmHero`.
- **#14** — Offline queue.
- **#49** — Encryption-at-rest can silently fail, and the justifying comment is factually wrong.
- **#121** — `ReportSheet` freezes the screen height at module load — the only file in the app that does.

**Unrelated on purpose.** Five separate judgments — the cap for unrelated work is 3,
so **treat this as the one batch most likely to need splitting.** Split it the moment
any single item needs its own reasoning.

**DONE WHEN** each of the five has its own test, or has been split into its own batch.

---

## BATCH 26 · Tribunal priority queue
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#24** — High · Completely broken live. Non-trivial: the RPC orders by `report_count DESC, created_at ASC`, and `report_count` is a window function, so it cannot appear in a `WHERE`.

**DONE WHEN** the queue returns reports in true priority order, proven against live
data before and after.

---

## BATCH 27 · Schema DDL
`Tier C` · `2 findings` · `no dependency` · **NOT STARTED**

- **#93** — No server-side length cap on any comment column.
- **#43** — `0005_log_comments_fk.sql` cannot be applied as written.

**DONE WHEN** an oversized comment is rejected by the server, and the migration
applies cleanly.

---

## BATCH 28 · Moderation RPC cleanup
`Tier C` · `2 findings` · `no dependency` · **NOT STARTED**

- **#95** — `p_admin_id` is a dead parameter on both moderation RPCs.
- **#96** — Three RPC branches silently no-op.

**DONE WHEN** every branch either acts or reports, proven by calling each one live.

---

## BATCH 29 · `search_path` hardening
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#28** — 24 `SECURITY DEFINER` functions lack `SET search_path`.

**Alone because** it touches 24 live functions. **DONE WHEN** all 24 carry it and a
smoke probe of each still returns what it did before.

---

## BATCH 30 · Index hygiene
`Tier C` · `2 findings` · `no dependency` · **NOT STARTED**

- **#29** — 9 exactly-duplicated indexes in production.
- **#3** — The notable-members query has no index.

**DONE WHEN** the 9 duplicates are gone, the new index exists, and query timings are
recorded before and after.

---

## BATCH 31 · Drop the dead subsystem
`Tier C` · `1 finding` · `no dependency` · **NOT STARTED**

- **#61** — An entire dead feature subsystem is still live in the database.

**DONE WHEN** a live probe proves nothing reads those objects, then they are dropped
with a written restore script.

---

## BATCH 32 · Migration ledger
`Tier C` · `1 finding` · `after 26–31` · **NOT STARTED**

- **#31** — Nothing records which migrations are actually live.

**After the DDL batches** because it is the thing that makes them auditable
afterwards. **DONE WHEN** the live schema can be reconciled against the repo by
running one command.

---

## BATCH 33 · Launch verification
`Tier C` · `2 findings` · **REQUIRES Android §1 config complete** · **NOT STARTED**

- **#30** — Launch-critical verification gap: push may be silently dead.
- **#8** — Android launch wiring: RevenueCat Android key, FCM/`google-services.json`, Play Console products.

**DONE WHEN** a real push arrives on both platforms, a sandbox purchase completes on
Android, and the `ANDROID_LAUNCH.md` §2 device pass is walked with eyes on the screen.
