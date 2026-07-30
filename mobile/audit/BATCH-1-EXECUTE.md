# BATCH 1 — EXECUTION SCRIPT. Ready to run. Do NOT re-audit.

**16 passes are already done.** Every correction below is baked in. A new session
should EXECUTE this, not re-study it. Re-studying is what burned the last budget.

**Full findings:** `audit/DEEP-VERIFY-131.md` (passes 1–16). Read only if a step fails.

**Anchors verified 2026-07-29 (pass 17):** all 26 name anchors in this file were checked
against the working tree and every one exists. Occurrence counts confirmed unambiguous —
`const mine = r.user_id === myId;` ×2 (the two realtime handlers, both intended),
`MESSAGE_DEDUP_CAP` ×2 (definition + the no-op slice), `getLoungeDetails` ×2 in
`LoungeService.ts` (:55 declaration and :68 a log line *inside the same method*, so removing
the method takes both). Everything else ×1. **Do not re-verify — execute.**

---

## GATE — run after EVERY commit

```bash
npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci --coverage
```

**CI is ALREADY RED before batch 1** (pass 15). This is pre-existing, NOT caused by us:
```
"./src/stores/" statements threshold (32%) not met: 31.75%
"./src/stores/" functions  threshold (29%) not met: 28.78%
```
So the gate is a **DELTA gate**: after each commit those two numbers must **not decrease**.
989 tests must stay green and `tsc` must stay clean — those are absolute.

**Anchor every edit BY NAME, never by line number** (pass 14): three commits edit the same
test file and each one shifts the line numbers of the ones after it.

---

## THE 15 COMMITS

### 1 — #5 · remove the stray test scaffold
- `git rm -r test-app/` + `git rm test_db.js test_schema.js`
- delete `test-app/` from disk (~20,480 untracked node_modules files)
- `tsconfig.eslint.json` → remove the `"test-app"` entry from `exclude` (verified: line 19)

### 2 — #43 · remove the dead migration
- delete `supabase/migrations/0005_log_comments_fk.sql`
- *(live DB already has `log_comments_user_id_fkey` → `auth.users(id) ON DELETE CASCADE`; this migration would fail on duplicate name)*

### 3 — C2 · remove the legacy lint config
- delete `.eslintrc.js`  *(verified: `eslint.config.js` flat config exists and is newer)*

### 4 — #81a · barrels + 10 dead hooks + cascade
- delete `src/hooks/index.ts`, `src/schemas/index.ts`, `src/constants/index.ts`
- delete these 10 from `src/hooks/`:
  `useDebouncedSearch.ts` `useFilmReviews.ts` `useLoungeData.ts` `useParallaxBreathing.ts`
  `useSafeAsync.ts` `useScaledFont.ts` `useStableSubscription.ts` `useStaggeredPrefetch.ts`
  `useStreak.ts` `useTMDBMovies.ts`
- delete `src/hooks/__tests__/useStableSubscription.test.ts` and `useDebouncedSearch.test.ts`
- **CASCADE:** remove `getLoungeDetails` from `src/services/LoungeService.ts`
  *(sole consumer was `useLoungeData.ts:13`; LoungeService itself stays live)*
- **AND** in `src/services/__tests__/servicesBatch2.test.ts` remove
  ``describe('getLoungeDetails', …)`` through its matching close
  *(**pass 11 found this — my plan originally missed it; without it the suite goes red here**)*

> **KEEP** `useBanCheck.test.ts` and `useEntitlement.test.ts` — pass 9. Their hooks
> survive; `useEntitlement.test.ts` is misnamed and genuinely tests `getTierWeight`.

### 5 — #72 · dead utils
- delete `src/utils/dateUtils.ts`, `src/utils/debounce.ts`, `src/utils/safeParse.ts`
- delete `src/utils/__tests__/safeParse.test.ts`
- *(order matters: commit 4 must land first — `useDebouncedSearch` and `useStaggeredPrefetch` both import `debounce`)*

### 6 — #76 · delete `src/utils/qos.ts` **then** `src/utils/apiCircuitBreaker.ts`
*(order load-bearing: `qos` imports `apiCircuitBreaker`)*

### 7 — #71 · delete `src/utils/concurrencyScope.ts` — **that is the whole commit**
> My plan also said "remove `filmStore.test.ts:156 jest.mock`". **That file does not exist
> and there is no such mock anywhere** (pass 13). Do not look for it.

### 8 — #79 · delete `src/schemas/dossier.schema.ts`

### 9 — #38 · delete `src/services/DossierService.ts`
- in `servicesBatch2.test.ts`: remove the ``// ══ DOSSIER SERVICE ══`` banner **and**
  ``describe('DossierService', …)`` through EOF
  *(pass 12: dropping only the describe orphans the banner)*

### 10 — #37 · remove `getFilmReviewCount` from `src/services/FilmService.ts`
- in `servicesBatch2.test.ts`: remove ``describe('getFilmReviewCount', …)`` through its
  matching close *(**pass 12: my original range ended 3 lines early — that cut mid-block and the file stopped parsing**)*
- the `FilmService` describe survives via `getFilmReviews`

### 11 — #53 · lounge.ts micro-cleanup (behaviour-identical)
- both realtime reaction handlers read:
  ```ts
  if (r.user_id === myId) return;
  const mine = r.user_id === myId;   // unreachable unless false
  ```
  → pass the literal `false`, drop the variable. **Proven identical by construction.**
- remove the no-op `.slice(0, Math.max(MESSAGE_DEDUP_CAP, s.currentMessages.length + 1))`
  *(slice end is always ≥ array length, so it never truncates)*
- **REGISTER, don't fix here (pass 11):** that was a *cap someone wrote that doesn't work*.
  `currentMessages` grows for the whole session. A naive `.slice(-100)` would **break
  scroll-back**, because paginated history is prepended into the same array. Needs a
  windowed design. Post-launch.

### 12 — #59 · remove the rejected hard-delete `deleteMessage`
- `src/stores/lounge.ts`: remove the interface line `deleteMessage: (messageId: string) => Promise<void>;`
  and the whole `deleteMessage: async (messageId) => { … },` implementation
- `src/stores/__tests__/lounge.test.ts`: remove ``describe('deleteMessage', …)``
- **ITS OFFLINE CHAIN GOES TOO (pass 13 — my plan missed all four):**
  `src/types/mutations.ts` → the `delete_lounge_message` schema
  `src/utils/mutationExecutor.ts` → the `delete_lounge_message` handler
  `src/utils/offlineQueue.ts` → `'delete_lounge_message'` from the type union
  `src/utils/__tests__/mutationExecutor.test.ts` → ``describe('delete_lounge_message', …)``
- **coverage:** this removes a *tested* function from the already-failing `src/stores/`.
  Measure live; direction is downward. Do not project — pass 15 proved the summary file is stale.

### 13 — #129 · WIRE the App Store review prompt
In `src/hooks/useLogFlow.ts`, inside `handleLog`:
```ts
const isNewEntry = !(isEditing && editLogId);
// … existing if/else (updateLog / addLog) unchanged …
setTimeout(() => {
  InteractionManager.runAfterInteractions(() => {
    router.back();
    if (isNewEntry) {
      InteractionManager.runAfterInteractions(() => {
        void maybeRequestReview(logs.length + 1);
      });
    }
  });
}, 650);
```
- `isNewEntry` — **must not fire on edits** (pass 12). 5 edits of one film ≠ 5 films.
- **nested** `runAfterInteractions` — waits for the dismissal to finish. `router.back()`
  is not awaitable, so the outer callback alone fires an OS modal over a moving screen,
  and a torn-down prompt still burns one of Apple's 3-per-365-days (pass 12).
- `logs.length + 1` is correct: `logs` is a render snapshot taken before the await, and the
  query is `.eq('user_id', user.id)` with `PAGE_SIZE = 50` — own logs only, exact below 50,
  and anyone above still passes the ≥5 test (pass 16).
- ⚠️ **This CANNOT be verified on TestFlight.** Apple's review sheet is a no-op in test
  builds. It will appear to do nothing — that is correct, not a bug (pass 16).

### 14 — #81b · WIRE the banned-member check
In `app/(modals)/list-modal.tsx` — **top of `handleSave`, right after `Keyboard.dismiss()`**:
```ts
if (checkBan()) return;      // const { checkBan } = useBanCheck() at component level
```
- **TOP of the handler, not before `createList`** (pass 16). `handleSave` covers **create
  AND edit** — gating only creation lets a silenced member keep editing their stacks.
  Web has that hole; do not copy it.
- **Must sit BEFORE `setSaving(true)`** — `setSaving(false)` only runs in the `catch`, so an
  early return placed after it strands the save button spinning forever. The existing
  `if (!title.trim()) … return;` proves the safe position.

### 15 — polish · stop error messages firing a success buzz
`reelToast(msg)` routes to type `'info'`, and `emitToast` fires `TactileEngine.error()`
**only** for `'error'` — everything else gets `TactileEngine.success()`.
Change to `reelToast.error(...)`:
- `src/hooks/useBanCheck.ts` → "Your account has been silenced by The Society."
- `src/hooks/useLogFlow.ts` → "Identification required to file a record."
- `src/hooks/useLogFlow.ts` → "No film selected."
- `src/hooks/useLogFlow.ts` → `reelToast(blockReason)`
*(verified safe: all 8 test mocks define `.error`, and no test asserts on these calls)*

**+ THE TWO REAL TESTS** — the only part never written:
- **#129:** extract a pure `shouldRequestReview({ logCount, lastPrompt, totalPrompts, now })`
  from `maybeRequestReview` and test it directly. **Copy the proven pattern in
  `src/hooks/useInitiation.ts` / `useInitiation.test.ts`** — the only hook here with real
  coverage. **Do NOT use `renderHook`**: `useAuthThrottle.pbt.test.ts:5` documents that it
  is async in this environment; someone already tried and gave up (pass 10).
- **#81b:** render `list-modal` with a banned user and assert `createList` is never called.
  Component rendering works — see `AuthGuard.test.tsx` and `LogForm.fields.test.tsx`.

---

## OUTSIDE BATCH 1 — registered, do NOT fold in

1. **Message deletion fails on bad wifi** *(pass 13, real user-facing)* — the live
   `withdrawMessage` has **no offline handling**; the `deleteMessage` we just deleted was the
   only one that had it. Own commit, own test: enqueue on network error and point the handler
   at the `withdraw_lounge_message` RPC instead of a hard `.delete()`.
2. **CI is red + the ratchet has never worked** *(pass 15)* — `jest.config.js` sets no
   `coverageReporters`, so `json-summary` is never emitted, so `scripts/coverage-ratchet.js`
   reads a file jest doesn't write (and `coverage/` is gitignored → absent on fresh CI).
3. **`lounge.ts` is at ~5% coverage** — the store behind your chat is effectively untested.
   That is why #1 went unnoticed.
4. **10 more hollow test files** — they assert on hand-written copies of logic, not your code.
5. **Unbounded `currentMessages` growth** — see commit 11.
6. **2 more success-buzz errors** in `useAuthFlow.ts` (email-required validation ×2).
7. **CSV import** — separate design, already agreed: identify the source from the file's
   header fingerprint (Letterboxd = out of 5, IMDb = out of 10), scan dates whole-file,
   preserve existing list privacy, reject low-confidence film matches, and make the whole
   import undoable. No questions asked of the member.

---

## KEPT — not deletions, deliberate deferrals
`sanitize.ts` · `performanceMonitor.ts` · `storyExporter.ts` · `navigationSnapshot.ts` ·
`useAnalytics.ts` · `useEntitlement.ts` · `useBanCheck.ts`

---
---

# ✅ EXECUTED 2026-07-30 — all 15 commits + follow-ups. DONE. Do not re-run.

Final gate, all four green: `tsc` 0 · `eslint` 0 (zero warnings) ·
`jest --ci --coverage` 0 · `coverage-ratchet` 0 · **1009 tests**.
Pushed to `origin/main` (7c4d69e → e143560).

## What execution found that 16 passes of reading did NOT

1. **#79 was a FALSE POSITIVE.** `dossier.schema.ts` was called unimported for
   16 passes. Deleting it broke the build instantly: `src/stores/content.ts`
   imports `DossierRowSchema` + `ValidatedDossierRow`, and content.ts is live
   behind the dispatch tab, article reader and compose screens. Reverted; KEPT.
2. **A whole directory was never searched.** `__tests__/` at the repo ROOT holds
   19 test files. Every grep all session was scoped to `src/` and `app/`, which
   is why pass 13 wrongly declared `filmStore.test.ts` fictional — it is at
   `__tests__/stores/filmStore.test.ts` and DID hold the concurrencyScope mock.
   The original plan was right; pass 13 "corrected" it into being wrong.
3. **Deleting a method orphaned its imports** (`captureError`, `logger` in
   LoungeService) — 2 new eslint warnings in a repo that was at zero.

All three were caught in seconds by building. None were findable by re-reading.

## Beyond the 15, same session

- **CI was RED before batch 1** (`src/stores/` under threshold). Covering
  `withdrawMessage` — the live delete-your-own-message path, previously
  near-untested — put it back over and **CI is green**.
- **The coverage ratchet had never run.** `jest.config.js` set no
  `coverageReporters`, so `json-summary` was never emitted and the script
  exited on its own "No coverage report found" guard. Fixed additively;
  verified end-to-end from a wiped `coverage/`.
- **Message deletion now survives a bad connection** — offline keeps the
  tombstone and queues `withdraw_lounge_message`; only a genuine refusal
  reverts. Both halves tested.
- **All toast severities swept** — every bare `reelToast(...)` in the codebase
  read in context (28 literal + 7 variable-form). 5 were errors buzzing like
  successes; fixed. The rest are genuine confirmations; left alone.
- **CSV import: all four silent corruptions fixed.**
  - **A-3** `detectSource()` reads the export's header fingerprint, so the scale
    is known, not guessed (Letterboxd = /5, IMDb & Trakt = /10). Plus a
    fractional-value proof rung. Kills the "every rating doubled forever" bug.
  - **A-2** `detectDateFormat()` scans the whole column once; one row with a
    first number >12 proves day-first. Kills the "half your dates transposed".
  - **A-1** list privacy/ranked/description round-tripped instead of
    overwritten, and new items append past the current max rank.
  - **A-4** confidence gate: `semantic`/`person`/`failed` are declined outright;
    a year mismatch needs an exact title. Can only narrow, never invent a match.
  - **#11** unmatched count counts films, not viewings.

## STILL OPEN

- **Import UNDO** — the safety net for the one genuinely undecidable case
  (hand-made file, no source, no halves, nothing above 5). Designed, not built.
- **`lounge.ts` ~5% covered** — the store behind chat. Why the offline gap sat
  unnoticed.
- **10 hollow test files** — assert on hand-written copies of logic, not the code.
- **Unbounded `currentMessages` growth** — needs a windowed cap; a tail slice
  would break scroll-back.
- ⚠️ **The App Store review prompt shows NOTHING on TestFlight.** Apple no-ops it
  in test builds. Correct behaviour, not a bug.
