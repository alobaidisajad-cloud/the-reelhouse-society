# ReelHouse — The 33 Batches

**This file is the single definition of what a batch number means.** When the
instruction is "study batch 7", it means the findings listed under **BATCH 7**
here — nothing else.

Written 2026-07-31. Launch target: **iOS and Android together**
(per `ANDROID_LAUNCH.md`, decided 2026-07-13).

---

## The register these batches come from

| | Count |
|---|---|
| Register entries (`audit/REGISTER-124.txt`) | **124** |
| Not findings — #9 withdrawn, #15 intentional, #133 a clean-bill statement, #196 a stray table row | 4 |
| **Tier A — DONE** (batch 1 = 13 deletions, batch 2 = 16 in-place edits) | **29** |
| **Tier C** — backend / SQL / live config. Not git-revertable. | **25** |
| **Tier B** — behaviour changes in app code. | **66** |
| | **= 124 ✓** |

The register is **124, not 131**. `all-131-findings.txt` holds 118 entries, the
master write-up holds 100, the union is 124. Numbers 10, 16–22, 66 and 97 were
never used. "131" is a label, not a count.

Tier A membership is derived and cross-checked three ways: the 17 named as Tier A
examples ∪ the 16 in `BATCH-2-PLAN.md` = 29, and 17 − the 4 overlaps = exactly the
"13 deletions" that plan describes.

---

## Batch sizing — and why it is what it is

Batch 2 was **16 findings. That was too many.** It shipped two false positives
(hitSlop "fixes" that made both buttons *smaller*), dropped a log id, left a
crash-class unhandled rejection, and took **three audit passes** to clean up.

The limit is not the count — it is **how many independent judgments happen without
a test to catch them**. Six findings in one subsystem sharing one test harness is
*one* judgment. Three unrelated findings are *three*.

| Kind | Per batch |
|---|---|
| Tier B — one subsystem cluster | up to **6** |
| Tier B — unrelated findings | **3** |
| Tier C — RLS, functions, live data | **1** |
| Tier C — additive hygiene (index, `search_path`) | **2** |

**The condition this rests on:** every finding gets a test that **fails before the
fix and passes after**, and the fix is then **deliberately broken to prove the test
catches it**. That discipline is what caught the hitSlop regression, a hollow
archive test, and a UUID guard that made a whole test vacuous. Without it, 3 per
batch is as unsafe as 16 was.

---

## Order — risk first, not tier order

- **Phase 1 (batches 1–9) · Tier C security.** Two of the three true blockers live
  here, and the private-notes leaks are exposing real members on the live database
  *today* — the web app shares that backend. This is not launch work; it is now work.
- **Phase 2 (batches 10–25) · Tier B.** The app members actually feel. Opens with
  the test-integrity batch, because it hardens the gate that protects the other 15.
- **Phase 3 (batches 26–33) · Tier C hygiene + launch config.**

**Start the Android §1 config tasks NOW, in parallel.** Play Console, RevenueCat
Android, FCM — they have external lead time and gate the device pass. They are not
code and do not need a batch slot; batch 33 only *verifies* them.

---

# PHASE 1 · Tier C — live security and the store blocker

### BATCH 1 · The private-notes leak (both halves)
**#26** (BLOCKING) · **#32** (High)
"Notes only you can see" are readable by anyone on the internet — and there is a
**second, independent leak that ignores RLS entirely**. Fixed together on purpose:
closing one alone leaves the data exposed by the other.

### BATCH 2 · Block-system privacy leak
**#23** (High) — the function trusts a caller-supplied `viewer_id`. All 8 call
sites already pass `auth.uid()`, so it can ignore the parameter and use
`auth.uid()` internally.

### BATCH 3 · Account deletion
**#42** (BLOCKING) — "Delete Account" deletes nothing. **App Store rejection risk:**
Apple requires working account deletion for any app with signup. Cannot be fixed
from the client.

### BATCH 4 · Blocking is one-directional
**#113** (High) — the blocked member can still see and reach the blocker.

### BATCH 5 · The REST exposure surface
**#7** · **#27** · **#34** — `preferences` JSONB readable via raw REST, anonymous
access inconsistent with the app's own rule, and the profiles grant list is a
point-in-time snapshot. One coherent grants audit.

### BATCH 6 · Server-side entitlement enforcement
**#125** (High) · **#123** (High) — paid-tier features and the Auteur publish gate
exist **only in the client**, with two proven bypasses. Revenue. Must precede the
client-side tier work in batch 12, or that work is theatre.

### BATCH 7 · Ban enforcement
**#80** (High) — incomplete in both layers; the client gate is dead code.

### BATCH 8 · Committed API key
**#65** (High) — the TMDB key is in git history and shipped in the web bundle.
Rotation, not just deletion.

### BATCH 9 · The bio-rename trigger
**#36** (High) — editing your bio silently renames you. **5 of 32 live members are
already affected**, so this is a trigger fix *plus* a data repair.

---

# PHASE 2 · Tier B — behaviour

### BATCH 10 · Test integrity — do this first
**#131** · **#132** · **#1** · **#6**
Test files are excluded from type-checking, coverage thresholds sit at 7–29% so the
ratchet cannot catch regressions, 32 lint warnings hide real ones, and a jest
teardown warning. **First because it hardens the gate that guards batches 11–25.**

### BATCH 11 · Block & mute enforcement in the client
**#92** · **#105** · **#106** · **#114** · **#112** · **#118**
One defect in six places: detail screens, salons, log comments, stack comments,
notifications, and a sheet that stays open after the action. One test harness.

### BATCH 12 · Purchases & tier resolution
**#47** · **#48** · **#99** · **#100** · **#101** · **#98**
Restore strips admin permanently, admin resolves to the *lowest* tier, an offline
restore demotes a paying member, the founding cap message lies, the restore handler
uses the one function the codebase warns against, and the banner hardcodes `$49`
for every storefront. Depends on **batch 6**.

### BATCH 13 · Dates & time
**#40** · **#74** · **#75** · **#109**
Logs default to the UTC calendar date; every date renders a day early west of UTC;
three `timeAgo` implementations, two of which were meant to be deleted.

### BATCH 14 · Sanitisation & link safety
**#68** · **#104** · **#103** · **#2**
List titles/descriptions are the only user input bypassing the sanitizer; dossier
comments skip it on the online path; markdown links bypass the URL allowlist
including on third-party RSS; cap the markdown render length.

### BATCH 15 · Profile identity & counts
**#86** · **#87** · **#50** · **#46**
Your own profile shows "WATCHLIST 0"; renaming your handle strands you on "Member
Not Found"; signup can assign a different username than you chose; stacks show
"4 FILMS" to everyone but the owner.

### BATCH 16 · Follow & offline social
**#67** · **#77** · **#78** · **#82**
Five of 32 live members cannot be followed at all; an offline follow is discarded;
an offline unfollow leaves a request standing; following someone doesn't refresh
the feed.

### BATCH 17 · Notifications
**#51** · **#73** — receiving one notification silently deletes up to 450 already
loaded; grouping is inert because a copy change broke the parser.

### BATCH 18 · Lounge
**#54** · **#55** · **#57** · **#58**
Unread counts recomputed client-side with unbounded queries duplicating a deployed
RPC; message loading swallows every backend error; paging on a bare `created_at`
cursor; a failed creation still burns the cooldown.

### BATCH 19 · Search
**#84** (Blocking) · **#85** · **#35**
The LOGS tab can never return a result — `logs.username` and `logs.role` do not
exist. Wildcard escaping is a no-op at 5 of 6 call sites and its quote escaping
enables filter breakout. At-the-Door returns arbitrary results past 500.

### BATCH 20 · Queries & limits
**#44** · **#128** · **#52** · **#63** · **#45** · **#94**
Unbounded comment fetches, `_hasMore` computed from the salvaged array so one bad
row ends pagination, the endorsement index capped at 500 so old certifications
render as un-certified, the stacks feed shipping ~7× what it renders, and an N+1 on
the Tribunal.

### BATCH 21 · Dossier publishing
**#122** · **#60** · **#12**
Essays over ~4,200 words are silently truncated on publish **and the draft is
deleted**; an offline-composed dossier appears twice; the zip-bomb guard.

### BATCH 22 · Log screen polish
**#89** · **#90** · **#91** · **#107** · **#111**
Screen readers announce success when the log failed; two stacked error toasts; a
dismissal timer with no unmount cleanup; a blank screen as the loading state; magic-
number coupling.

### BATCH 23 · Store hygiene & lifecycle
**#62** · **#64** · **#39** — `_watchlistPromises` never garbage-collected; logout
leaves the previous user's pagination state; the stack endorsement count is
viewer-dependent.

### BATCH 24 · Dead code & fabricated data
**#5** · **#127** · **#41** — dead artifacts; `DossierService.ts` is dead code whose
tests give false confidence; the news feed fabricates two articles with faked recent
dates and dead links.

### BATCH 25 · The remaining singles
**#11** · **#13** · **#14** · **#49** · **#121**
`skipped` mislabeled (counts watches), `FilmHero`, the offline queue item,
encryption-at-rest can silently fail with a factually wrong justifying comment, and
`ReportSheet` freezes screen height at module load.

---

# PHASE 3 · Tier C — hygiene and launch config

### BATCH 26 · Tribunal priority queue
**#24** (High) — completely broken live. Non-trivial: the RPC orders by
`report_count DESC, created_at ASC` and `report_count` is a window function, so it
cannot appear in a `WHERE`.

### BATCH 27 · Schema DDL
**#93** · **#43** — no server-side length cap on any comment column;
`0005_log_comments_fk.sql` cannot be applied as written.

### BATCH 28 · Moderation RPC cleanup
**#95** · **#96** — `p_admin_id` is a dead parameter on both moderation RPCs; three
RPC branches silently no-op.

### BATCH 29 · `search_path` hardening
**#28** — 24 `SECURITY DEFINER` functions lack `SET search_path`.

### BATCH 30 · Index hygiene
**#29** · **#3** — drop 9 exactly-duplicated production indexes; add the missing
index on the notable-members query.

### BATCH 31 · Drop the dead subsystem
**#61** — an entire dead feature subsystem is still live in the database.

### BATCH 32 · Migration ledger
**#31** — nothing records which migrations are actually live. Process fix; also the
thing that makes batches 26–31 auditable afterwards.

### BATCH 33 · Launch verification
**#30** · **#8** — confirm push actually works (it may be silently dead), and the
Android wiring: RevenueCat Android key, FCM/`google-services.json`, Play Console
products. **The §1 config tasks should already be done by this point** — this batch
verifies them and runs the device pass in `ANDROID_LAUNCH.md` §2/§4.

---

## How each batch runs

1. **Study** — open every finding, verify it still exists in the code, and confirm
   it is not a false positive. Batch 2 shipped two; the premise gets checked, not
   just the fix.
2. **Test first** — a test that fails against current code.
3. **Fix** — smallest change that makes it pass.
4. **Mutation-verify** — break the fix on purpose, confirm the right test fails.
   *(Repo files are CRLF: any mutation using `\n` matching silently does nothing and
   fakes a pass. Always print a before/after count of the mutated token.)*
5. **Gate** — `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci
   --coverage` + `node scripts/coverage-ratchet.js`.
6. **Ship** — commit and push to `main`.

**Tier C additionally:** a live probe before, the SQL pasted in chat (never a file
path, never `db push`), a written rollback, and a live probe after.
