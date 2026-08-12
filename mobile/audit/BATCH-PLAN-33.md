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
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-08-01** — ban + suspension now enforced

- **#80** — High · Incomplete in both layers, and the client gate is dead code.

**DONE WHEN** a banned test account is refused by the server, proven live, and the
dead client gate is either wired or removed — decided, not left ambiguous.

---

## BATCH 8 · Committed API key
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-08-01** — leaked key confirmed DEAD (401)

- **#65** — High · The TMDB API key is committed to git and shipped in the web bundle.

**Alone because** it is a rotation, not a deletion. Removing it from the code does
nothing while the old key is still valid.

**DONE WHEN** the old key is revoked at TMDB, the new key is not in the repo, and the
app still fetches.

---

## BATCH 9 · The bio-rename trigger
`Tier C` · `1 finding` · `no dependency` · **✅ DONE 2026-08-02** — 7/7 live checks PASS

- **#36** — High · Editing your bio silently renames you. **5 of 32 live members are already affected.**

**Alone because** it is a trigger fix *plus* a data repair on live rows.

**DONE WHEN** the trigger no longer touches the username, and the 5 affected members
are repaired — each one named in the commit.

**WHAT ACTUALLY HAPPENED.** The finding named one bug and one cause; both were partly
wrong, and the fix is four things, not one.

- The cause was never the trigger. `enforce_username_policy` has never touched the
  charset — the live body only ever checked reserved words and collisions. The rename
  came from the mobile client writing the SANITIZED handle unconditionally on every save.
- The finding blamed `handle_new_user`'s `split_part(email, '@', 1)` for the
  email-as-username row. It cannot have produced it: split_part returns the part BEFORE
  the '@'. It arrived through `raw_user_meta_data` from the WEBSITE, where signup never
  ran the validator, and its one cleaning step — `.replace(/\\s+/g, '_')` — matched a
  literal backslash followed by "s", not whitespace. It did nothing at all.
- Web edit-profile re-implemented the rules and disagreed: allowed CAPITALS and stored
  the handle untouched, capped length at 20 not 30, no reserved words, no profanity.
- `handle_new_user` was SECURITY DEFINER with no `search_path` pinned, despite running
  on every signup. Missed by the batch 5–8 sweep.

**THE DATA REPAIR WAS NOT DONE, DELIBERATELY.** The owner's call, and the right one:
renaming members without asking is the exact harm this batch exists to stop. All five
keep their handles. They can rename themselves whenever they like. One consequence is
accepted and open: `saleelsaleel555@gmail.com` remains a publicly readable email
address until that member chooses a new handle.

**⚠️ TEMPORARY CODE IN THE MIGRATION — REMOVE AT LAUNCH.** The backstop alone does NOT
protect the shipped TestFlight build. That build sends the sanitized handle on every
save, and `ug.mb` → `ugmb` is a perfectly LEGAL name, so every rule accepts it and the
member is renamed anyway. Measured: without the guard 0/5 handles survive a bio-only
edit, with it 5/5. `20260802_01_username_charset_backstop.sql` carries a guard keyed on
that exact signature. **Delete it once the launch build is the only one in the wild.**

---

## BATCH 10 · Test integrity
`Tier B` · `4 findings` · `no dependency` · **DO BEFORE 11–25** · **✅ CLOSED 2026-08-02** — 3/4 fixed, #6 open by decision

- **#131** — High · Test files are excluded from type-checking. — ✅ **174 errors → 0**
- **#132** — High · Coverage thresholds sit at 7–29%, so the ratchet cannot catch regressions. — ✅ **re-based + ratchet wired**
- **#1** — High · 32 lint warnings, which hide real ones. — ✅ **already 0; now ENFORCED at 0**
- **#6** — Low · Jest teardown warning. — ⚠️ **OPEN, see below**

**First because** this is the gate that guards batches 11–25. Every later batch is
verified by a gate that currently does not type-check its own tests.

**DONE WHEN** tests are type-checked, the ratchet fails on a deliberate coverage
drop, and the warning count is zero.

**WHAT THE GATE ACTUALLY WAS.** Three gates existed on paper and had never run once:
the web Vitest suite (its workflow triggers only on pull_request, and this project
pushes straight to main), eslint (no workflow ran it at all), and the lounge-embed
contract test (skips itself without Supabase env, and the CI job had no env block).
The web suite was also RED — a stale mock in core-flows.test.tsx — so it was fixed
first and only then switched on.

**COVERAGE WAS MEASURING HALF THE APP.** `collectCoverageFrom` listed only `src/**`,
so all 36 files and ~15k lines of `app/` — every screen — were invisible to every
floor and gate. The honest global number is 23.53% (was reported as 26.79%), and
`app/` alone is ~10%.

**⚠️ FOUR SETS OF TESTS COULD NOT FAIL.** filmStore.test.ts (7), ActionDeck.test.tsx
(5 of 6), films.test.ts (2). Each wrote a value and then asserted the value it had
just written; the store's own code never ran. ActionDeck's file never even imported
ActionDeck, and one test invented its own tier rule that contradicts src/utils/tier.ts
(a founding member passes there and would have failed the fake check). 14 deleted —
after verifying real coverage exists elsewhere, not assumed. ActionDeck now has NO
behavioural coverage, which is the truth and is recorded in the file.

**30 UNAWAITED fireEvent CALLS** across 7 files. fireEvent is async in RNTL v14, so
assertions were running before the press had settled — "overlapping act() calls",
3 per run, now 0.

**#6 IS OPEN, DELIBERATELY.** The Jest worker warning is isolated to
`app/(admin)/__tests__/tribunal.test.tsx` and only when it runs in a worker (which is
why `--detectOpenHandles` shows nothing — that flag forces serial mode). The worker's
live handles are Pipe x1 + Socket x2 with a pending write: Jest's own IPC and stdio,
not app handles. Ruled out BY TESTING: fake timers (pending and removed entirely —
the suite still passes 24/24 without them), QueryClient teardown, Reanimated,
expo-image, PressableScale, React Query generally, heavy rendering generally, console
volume, and the act overlap. Cause not found. `--forceExit` deliberately NOT added —
it hides this and can truncate coverage output. It is a warning after a passing suite;
it blocks nothing and ships nothing. Revisit if it ever turns into a hang or a flake.

---

## BATCH 11 · Block & mute enforcement in the client
`Tier B` · `6 findings` · `after batch 4` · **✅ CLOSED 2026-08-02** — 6/6 + 2 not in the register

- **#92** — Blocking someone doesn't hide their comments on three detail screens. — ✅ **server-side, LIVE**
- **#105** — Blocking inside a salon leaves their messages on screen while the toast says they're hidden. — ✅ **faces LIVE, message purge ships at launch**
- **#106** — Log comments have no block filtering at any layer. — ✅ **LIVE**
- **#114** — Stack comments have no block filtering at any layer. — ✅ **LIVE**
- **#112** — Notifications ignore block and mute entirely. — ✅ **in-app + push LIVE, socket filter ships at launch**
- **#118** — The stack action sheet stays open after Block or Mute. — ✅ **ships at launch**
- **⭐ NOT IN THE REGISTER** — a blocked member's face stayed on your salon cards. — ✅ **LIVE**
- **⭐ NOT IN THE REGISTER** — a blocked member could still buzz your lock screen. — ✅ **LIVE**

**Together because** this is one defect in six places. One test harness proves all
six; six separate batches would rebuild it six times.

**DONE WHEN** one blocked account is invisible across all six surfaces, each proven
by a rendering test.

**THE FIX IS SERVER-SIDE, AND THAT WAS MEASURED.** A client-only fix BREAKS the
dossier: it takes its comment count from `{ count: 'exact' }` — unfiltered — and
drives "LOAD EARLIER · N MORE" from `commentTotal > comments.length`, with a keyset
cursor set to the oldest VISIBLE comment. Filter client-side and that button never
disappears, and once a blocked author owns the true oldest row the next page
re-fetches rows already seen, dedupes to nothing, and the list is stuck. Filtering at
the query layer makes count and content agree for free. It is also the pattern
20260620_feed_block_filtering already chose, for the same pagination reason — and it
protects everyone TODAY, on the current TestFlight build and the live website,
instead of at launch.

Migrations: `20260802_02` (RESTRICTIVE SELECT policies on log_comments,
list_comments, dossier_comments, notifications), `20260802_03` (salon faces),
`20260802_04` (push trigger). All verified live after applying.

**⚠️ TWO TRAPS, BOTH PROVEN ON A REPLICA RATHER THAN ARGUED.**

1. RESTRICTIVE, never permissive. Every existing SELECT policy on those tables is
   permissive, and permissive policies combine with OR — a permissive "restriction"
   is silently ignored (learned in batch 5).

2. `is_hidden_by()` IS WRONG INSIDE THE PUSH TRIGGER. It ignores its viewer_id
   argument and reads `auth.uid()`, which inside that trigger is the ACTOR, not the
   recipient — so it asks "does this person hide themselves?", answers no, and
   filters nothing while reading as correct code. Measured, same data, blocked actor:
   `is_hidden_by(NEW.user_id, ...)` → **1 push sent**; explicit recipient/actor
   EXISTS check → **0**. The trigger uses the explicit check.

**ALSO CHECKED BEFORE APPLYING:** RLS is actually ENABLED on all four tables (a
table can carry policies with RLS off, making them inert); `is_hidden_by` is STABLE,
DEFINER and EXECUTE-granted to authenticated and anon (an RLS expression runs with
the QUERYING role's privileges — the batch 6 trap); `notifications.from_user_id`
exists and is NULLABLE, so the NULL branch is required or every system notice would
vanish; `get_report_evidence` is SECURITY DEFINER so the tribunal still sees reported
comments; no denormalised comment counters exist; comments are not threaded so
hiding one cannot orphan replies; and `tg_notify_push`'s live body, security,
search_path and owner were all read before being replaced.

**Salon faces detail:** the filter sits INSIDE the CTE, before `row_number()`.
Filtering after `rn <= 3` would have been the obvious one-liner and the wrong one —
a salon whose three earliest members you had all blocked would render an EMPTY
avatar stack while the salon was full. Proven one line apart: `ava,ben,cleo` →
`ava,cleo,dane`.

**Client half (ships with the launch build):** `purgeHiddenMessages()` re-filters
lounge messages already on screen; the stack sheet closes; `from_user_id` added to
the notification query/schema/type; the realtime socket filters — and ONLY the
socket, because fetch and loadMore compute their pagination cursor from the rows they
keep and are already covered by RLS. The mute toast now says what mute actually does
rather than promising only "your feeds".

---

## BATCH 12 · Purchases & tier resolution
`Tier B` · `6 findings` · **REQUIRES BATCH 6** · **✅ CLOSED 2026-08-03**

- **#47** ✅ — "Restore Purchases" silently strips admin privileges, permanently.
- **#48** ✅ — The admin account resolves to the *lowest* tier; unknown tier values downgrade silently.
- **#99** ✅ — Tapping "Restore Purchases" offline locally demotes a paying member.
- **#100** ✅ — Buying a founding seat after the cap fills says "Welcome to the Founding Board!"
- **#101** ✅ — The restore handler uses the one function the codebase warns against for `tier`.
- **#98** ✅ — The founding banner shows a hardcoded `$49` to every storefront.

**Together because** they are one subsystem with one shared tier-resolution path.

**DONE WHEN** an admin survives a restore, an offline restore changes nothing, an
unknown tier value never downgrades, and the price comes from the store. — all met.

### Found during the batch, not in the register

- **A web purchase was destroyed by "Restore Purchases".** RevenueCat truthfully
  reports "this Apple ID never bought anything" for a PayTabs sale — that is
  ignorance, not a cancellation — and the app wrote `cinephile`, wiping the purchase
  on BOTH surfaces. Closed by `profiles.entitlement_source` + `grant_entitlement`:
  *a provider may only LOWER a tier it granted.* Server-side, so it protects the
  build already on TestFlight. `20260803_01_entitlement_source.sql`, applied live.
- **One member's tier could land on another account.** The offline queue treats a
  payload without `user_id` as session-scoped and safe; `sync_entitlement` had none,
  and the edge function applies the tier to whoever is signed in.
- **`profiles.tier` had no CHECK constraint** — which is how `projectionist`, a tier
  removed from the product, sat in a live row. `20260802_07`, applied live.
- **The new `entitlement_source` column would have been a free-premium exploit** if
  it had not been added to `protect_privileged_profile_fields`: cancel, set your own
  source to `paytabs`, and RevenueCat can never demote you again.
- **The founding poll waited for a weight it could never reach** when the seats
  filled mid-purchase, so that member's session was never refreshed either.
- **`paytabs-handler` is deployed with `verify_jwt: true`**, so PayTabs' webhook is
  rejected by the gateway before the code runs — and none of the three PayTabs
  secrets exist, so checkout cannot start either. Web payments are entirely
  non-functional; nobody has been charged. **Deferred by the owner's decision** —
  it is a product call, not a bug fix. See `paytabs-not-functional` in memory.

### Still open, deliberately

- **There is no RevenueCat webhook.** The app's sync is the only thing that ever
  retires a lapsed subscription, so a member who cancels and never reopens the app
  keeps their tier. Worth its own batch.
- The `followers_count` / `following_count` / `total_logs` columns are NOT protected
  by `protect_privileged_profile_fields`, though an older version of that trigger did
  guard them. Notes say follow-count tampering was closed another way; unverified.

---

## BATCH 13 · Dates & time
`Tier B` · `4 findings` · `no dependency` · **✅ CLOSED 2026-08-03**

- **#40** ✅ — Log dates default to the UTC calendar date, not the member's local date.
- **#74** ✅ — Every logged date renders one day early for users west of UTC.
- **#75** ✅ — *Four*, not three, `timeAgo` implementations. The register undercounted:
  the fourth was `getTimeAgo` in `ActivityCard.tsx`, hidden by its different name.
- **#109** ✅ — **not a separate defect.** It points at `log/[id].tsx:42`, which is one
  of #75's four. The same line, counted twice.

**DONE WHEN** a member west of UTC sees the correct date, proven across a table of
timezones, and one `timeAgo` implementation remains. — all met, across six zones from
Midway (UTC-11) to Kiritimati (UTC+14).

### Found during the batch, not in the register

- **The importer silently destroyed dates.** `archiveImport` used the UTC day as BOTH
  the future-date ceiling and the corrupt-row fallback, so east of UTC in the morning
  every entry watched *today* was clamped back to yesterday — on the one path that
  imports years of history at once. Its fallback parser also stored the UTC day of a
  locally-parsed date ("Jul 25" from Tokyo → `2026-07-24`).
- **New Year's Day films landed in the wrong year.** `YearInCinemaService` decided the
  year with `new Date(d).getFullYear()`, and the month the same way, so west of UTC a
  Jan 1 film joined the *previous* year's retrospective and `2026-05-01` counted as
  April. **The existing test suite already proved this** — it had never been run
  outside UTC.
- Export filenames used the UTC day; `timeAgoLower` was dead.

### The two things that mattered most

- **No `Intl` in the fix.** The obvious answer is `timeZone: 'UTC'` — which is what
  `formatTMDBDate` did, and what the audit recommended copying. But this app runs on
  **Hermes with no Intl polyfill**, and whether Hermes honours that option cannot be
  verified without a device. A calendar date now never becomes a `Date` at all: it is
  split into integers and formatted from a month table. `profileComputed.ts` already
  did exactly this, and its comment says why — that file was right all along.
- **Two files were already correct and were deliberately left alone.**
  `profileComputed` and `NitrateCalendarGrid` both handle this properly. A confident
  sweep would have "fixed" both and shipped two regressions.

### Harness traps — read before writing any timezone test

- Mutating `process.env.TZ` **inside** a jest-expo test does **nothing**. Los Angeles
  and Tokyo both returned `Jul 25`. The natural harness passes while proving nothing.
- TZ must be set before the process starts. `npm run test:tz` does that across six
  zones; CI now also runs the suite under `America/Los_Angeles`, having only ever run
  in UTC — which is why this survived for months.
- Spawning `npx jest` from a Node script fails with `EINVAL` on Windows/Node 24; the
  runner invokes Jest's entry point with `process.execPath`.

---

## BATCH 14 · Sanitisation & link safety
`Tier B` · `4 findings` · `no dependency` · **✅ CLOSED 2026-08-04**

- **#68** ✅ — stack titles/descriptions raw. BROADER than filed: the OFFLINE path was
  raw too, so unlike 104 there was no accidental half-protection.
- **#104** ✅ — dossier critiques sanitised OFFLINE and not online.
- **#103** ✅ — markdown links bypassed the URL allowlist at all three mounts.
  ⚠️ SCOPE CORRECTED: the register calls third-party RSS the highest-risk surface, but
  NewsService never populates `body` and the excerpt is tag-stripped to 160 characters.
  It is member-authored dossiers, not syndicated news.
- **#2** ✅ — REAL, but named after the wrong vulnerability (below).

**DONE WHEN** a hostile payload is rejected at every one of the four entry points, each
with its own test. — met, at six entry points.

### THE FIND — the sanitiser itself was incomplete

`sanitizeInput` did not strip **U+202A–U+202E**. Unicode has three families of
bidirectional control; this guard caught the marks (200E/200F) and the isolates
(2066–2069) and missed the embeddings and OVERRIDES. **U+202E is the canonical
Trojan-Source character.** That hole sat under EVERY sanitised surface in the app —
reviews, log comments, list comments, lounge messages, dossier titles and bodies — and
this batch would have routed four more inputs into it.

Found by asserting the whole CLASS rather than the listed members, which is exactly
what a regex that looks thorough survives.

### #2 was named after an advisory that cannot fire

It exists to mitigate a `linkify-it` quadratic. **linkify is disabled** — the library
builds `MarkdownIt({ typographer: true })`, and markdown-it's linkify default is false.
Two OTHERS are reachable, measured against markdown-it 10.0.0: smartquotes **16843ms at
200k**, nested emphasis **6877ms at 80k**. Reachable in production because the WEB app
writes `full_content` with no sanitiser and no cap to this same database.

Smart quotes kept deliberately: disabling that rule buys 87ms on the LESSER vector and
nothing on nested emphasis, at the cost of curly quotes on an app built for film
writing. Capped instead at `MAX_LENGTHS.dossierContent` — the limit the sanitiser
already enforces, so one number has one meaning on both sides. The compose preview is
NOT capped; truncating an author's draft while they write is the app fighting its user.

### Four the register never listed

- Profile **bio / display_name / persona** wrote raw. `bio` had a MAX_LENGTHS profile
  and NOT ONE caller — Zod capped their length and stripped no characters. This makes
  the claim that stack titles are "the only user input bypassing the sanitizer" false.
- **Moderation report `details`** raw on BOTH paths — text one member writes about
  another, rendered to moderators in the Tribunal.
- **social_links** had no URL validation at write. NOT exploitable: the opener prefixes
  `https://` to anything not starting with "http", which neutralises a scheme payload.
  Hygiene only, now shared with the opener via `normalizeSocialUrl` so the two cannot
  drift. ⚠️ Naive validation here would have STRIPPED EVERY BARE-DOMAIN LINK, which is
  how members actually type them.
- **private_notes** bypasses it too, but is owner-only, so a consistency gap rather than
  a vulnerability. Recorded, not inflated.

### ⚠️ The library inverts the usual convention

`react-native-markdown-display@7.0.2`: a handler returning **true** makes it ALSO call
raw `Linking.openURL` — the intuitive fix opens every link twice, the second time
completely unvalidated. `onMarkdownLinkPress` returns the LITERAL type `false` so that
mistake is a compile error. Do not widen it.

### The lesson worth carrying forward

Tests proving `sanitizeInput` works are NOT tests proving it is called. Measured:
deleting the sanitiser from listSlice, ProfileWriteService AND reportStore at once left
the whole suite green — 1322 passing. `sanitisationCallSites.test.ts` now drives each
real function against a captured Supabase, and the same mutation fails 5 tests.

`buildCritiquePayload` was extracted to `utils/` because importing a SCREEN into a test
dies on native mocks — practical proof that logic living inside a screen is logic no
test will reach, which is exactly how the online path went unsanitised.

### Cleared — checked, not assumed

The **WEB is safe**. Its markdown parser is alarming in isolation (URLs interpolated
into `href` with no scheme check, `"` never escaped, and on the web `javascript:` hrefs
execute) — but all FOUR `dangerouslySetInnerHTML` sites wrap output in DOMPurify with an
explicit tag/attribute allow-list. Enumerated, not inferred. The parser is one refactor
away from dangerous; worth knowing before anyone touches it.

---

## BATCH 15 · Profile identity & counts
`Tier B` · `4 findings` · `no dependency` · **CLOSED 2026-08-06**

- **#86** — High · Your own profile shows "WATCHLIST 0" while the tab beside it shows the real count.
- **#87** — High · Renaming your handle strands you on "Member Not Found" — for your own profile.
- **#50** — High · Signup can silently assign you a different username than you chose.
- **#46** — High · Every member's stacks show "4 FILMS" to everyone except themselves.

**Together because** all four are identity-and-count resolution on the profile.

**DONE WHEN** counts match their tabs, a rename keeps you on your own profile, and
signup assigns the chosen name or fails loudly.

**CLOSED.** #86 one count derivation shared by pills and cards; #46 PostgREST aggregate
(`film_count[0].count`) + `filmCount` made REQUIRED on the type so both producers were a
compiler error; #50 signup records the requested handle and a notice fires when it
differs, covering BOTH signup paths; #87 the route follows the rename via the
route-bound `navigation.setParams`, gated so a re-claimed handle can never be hijacked.
**Beyond the finding:** `video_reviews.username` was a FOURTH denormalised handle column
the register never listed — the class was enumerated from the schema and each table
probed live. SQL: `20260806_01_sync_denormalized_username.sql` (trigger + back-fill of
the 6 live dead rows), proven on throwaway PostgreSQL, 4 mutations caught.

---

## BATCH 16 · Follow & offline social
`Tier B` · `4 findings` · `no dependency` · **CLOSED 2026-08-06**

- **#67** — High · Five of 32 live members cannot be followed at all.
- **#77** — Following someone while offline is silently discarded.
- **#78** — An offline unfollow leaves a pending follow request standing.
- **#82** — High · Following someone doesn't refresh the feed — their content stays invisible.

**Together because** one follow path, one offline queue.

**DONE WHEN** all 32 live members can be followed, and an offline follow/unfollow
survives a reconnect — proven by driving the queue.

**CLOSED.** #67 the lookup guard now rejects what is unsafe instead of allowlisting a
charset that never matched the column (5 members unblocked). #78 was broader than filed
— the requested state was cleared in NO path, online included. #82 narrowed three times
to the two feeds that actually read the graph. #77 **the register's false-positive
verdict was WRONG**: live-probed 42P10, the whole silent-discard chain confirmed.
**Beyond the register:** hydration erased writes still in the queue (and there are TWO
hydrators, both clobbering); and the follow graph's offline cache was written on every
follow and NEVER read — `followStore.hydrateFromCache` had zero callers, so the graph
started empty on every cold start. SQL: `20260806_02_interactions_follow_unique.sql`,
proven on PostgreSQL 18 including the privacy-trigger interaction.

---

## BATCH 17 · Notifications
`Tier B` · `2 findings` · `after batch 11` · **CLOSED 2026-08-06**

- **#51** — High · Receiving one notification silently deletes up to 450 already-loaded ones.
- **#73** — High · Notification grouping is completely inert — a copy change broke the parser.

**DONE WHEN** an incoming notification preserves the loaded list, and grouping is
pinned by a test that fails if the copy changes again.

**CLOSED.** #51 was two numbers for one policy (50 vs 500); one shared cap, and the
eviction arithmetic now counts what actually fell off instead of assuming one row.
#73 was bigger than filed: THREE producers write `endorse` notifications (log, stack,
dossier) and the audit's film_id fix would have covered one. Identity is now DECLARED
by the trigger via `group_key`; the message regex is deleted, not repaired.
**Beyond the register:** the group headline was built by the same broken regex (would
have read "your review of your review"); the group tap routed by film only, so stack
and dossier groups would have gone NOWHERE; the SELECT column list was duplicated
byte-for-byte; and `markGroupRead` lacked the ownership filter its twin documents.
SQL: `20260806_03_notification_group_key.sql`, proven on PostgreSQL 18, 4 mutations
caught. **No backfill is possible** — an existing row does not record its target.

---

## BATCH 18 · Lounge
`Tier B` · `4 findings` · `no dependency` · **CLOSED 2026-08-07**

- **#54** — High · Unread counts recomputed client-side with unbounded queries, duplicating a deployed RPC.
- **#55** — High · Lounge message loading swallows every backend error, silently.
- **#57** — `loadMoreMessages` pages on a bare `created_at` cursor.
- **#58** — A failed lounge creation still burns the 30-second cooldown.

**DONE WHEN** unread counts come from the RPC, a backend failure surfaces, and paging
cannot skip or repeat a message.

**CLOSED.** #55 the filed DIAGNOSIS was wrong — the catches always toasted; the defect is
`if (data && !error)` skipping the block because supabase-js resolves rather than throws.
And the class was 7 reads, not 2 — treated by consequence, not uniformly. #57 compound
cursor matching the house pattern. #58 TWO failure paths burned the cooldown, not one.
#54 the register said to call `get_user_lounges`; that takes a caller-supplied id,
returns invite_code, and had its access revoked in batch 7 — a NEW SECURITY INVOKER
function replaces the two unbounded scans instead.
**Beyond the register:** `resolveProfile` CACHED its failure, pinning the name unknown
to a real member for 5 minutes. SQL: `20260807_01_lounge_unread_counts.sql`, proven on
PostgreSQL 18, 4 mutations caught.

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
`Tier C` · `1 finding` · `no dependency` · **CLOSED 2026-08-10**

- **#28** — 24 `SECURITY DEFINER` functions lack `SET search_path`.

**CLOSED.** The filed count was wrong three ways (register 24, re-audit 18, **live 12**)
and the filed severity was wrong: this was never "hardening only".

**#28.1 — a live privacy bypass, HIGH.** `get_following_feed` is `SECURITY DEFINER`,
so it never consults RLS. Sealed a member, then asked as `anon`: the gate said false,
the logs table returned 0 reviews, the function returned the review text. Over plain
HTTP with the public key and no login: **200, review body returned.** The register had
recorded it "not deployed (404)" — untrue. **DROPPED** (no caller at any commit,
absent from the contract, not in the shipped TestFlight build), with a gated restore
script in-file. Every other feed function checked: all nine gate correctly.

**#28.2 — the pin we already used was VACUOUS.** `SET search_path = public` does not
stop `pg_temp` shadowing. Proved on a REAL function: with a decoy `logs` table planted,
`get_profile_counts` returned 0/0 instead of 145/93; with `public, pg_temp` it returned
the truth. Scope was therefore **102 functions, not 12** — I had wrongly bounded it to
`SECURITY DEFINER` and missed 14 invoker functions, including all nine gatekeepers RLS
itself calls. 106 now protected, **0 left**.

**Found during post-execution smoke testing — `get_priority_reports` had raised on
EVERY call since batch 26** (declared `content_id uuid`, table stores `text`). The
Tribunal docket was unopenable. Mine, and batch 26's "live-verified" note was vacuous.
Fixed, and the live checker now **executes** the admin RPCs rather than only checking
they exist.

**DONE WHEN** — met: 0 functions unpinned, the leak returns 404 over HTTP, the decoy
attack returns true data, and feeds/lounges/analytics/push/tier checks all still work.

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
