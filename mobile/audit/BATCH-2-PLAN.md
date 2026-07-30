# BATCH 2 — FINAL PLAN. All 16. Every gap closed, every decision made.

**Identification — PROVEN, not derived.** Tier A = 29 clean; batch 1 took the 13 deletions.
Verified against the tree: every batch-1 deletion is **gone**, every item below is **still
open in the code**.

**Scope: #4 #25 #33 #56 #69 #88 #102 #108 #110 #115 #116 #117 #119 #120 #124 #126**

**Verdict: 13 actionable · 3 NO ACTION · 0 unresolved.**
Gate after every commit: `npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx jest --ci --coverage`

---

# ❌ NO ACTION — 3, each decided, not deferred

### #25 · FALSE POSITIVE
`scripts/check-backend-live.mjs` is a **manual deploy-time tool** (its own header documents
`SUPABASE_DB_URL=postgres://… node scripts/…`). Its CI counterpart **exists and passes**:
`__tests__/backendContract.test.ts`, 2 tests green, re-deriving every `.rpc()` and edge
function the app calls. Wiring the script into CI needs a **postgres connection string in
GitHub secrets** — a materially worse attack surface — and it self-skips without config, so
it would become a job that always passes and checks nothing. **The design is correct.**

### #33 · THE FIX IS MORE DANGEROUS THAN THE DEFECT
Supabase tracks applied migrations **by filename**; renaming one already applied re-runs DDL
against production. Under-counted too: **three** colliding dates (`20260526` ×2, `20260620`
×3, `20260621` ×2); `20260626_*` and `20260701_*` are already sequenced.
Within each colliding date the files are **mutually independent**, and lexicographic order is
deterministic — ordering is implicit but not ambiguous in effect.
**→ Use `_NN_` for NEW migrations. Never rename an applied one.**

### #119 · FALSE POSITIVE — already has hitSlop
The control is `LogComments.tsx` → `onPress={onPostComment}` / "FILE CRITIQUE". It carries
`hitSlop={HITSLOP}` where `HITSLOP = {top:15,bottom:15,left:15,right:15}` (`:23`).

### (withdrawn) the eslint "missing dep" I raised last pass
`compose.tsx:77` — `edit` comes from `useLocalSearchParams()` (`:26`). **Route params cannot
change for a mounted screen**, so `[]` + the suppression correctly express "run once on
mount". My own false positive; withdrawn.

---

# 🔴 COMMIT 1 · #110 — the only user-facing bug. Do it first.

**The handler is REACHABLE.** `log/[id].tsx:648` opens the sheet; `onBlock` beside it works;
`onMute` (`:720`) only closes it. Identical pair in `dossier/[id].tsx` (author mute `:601`
works, comment mute `:649` is the no-op). **A member taps Mute and nothing happens.**

`app/log/[id].tsx:720`
```ts
onMute={() => {
  muteUser(selectedComment.user_id);
  setCommentActionSheetVisible(false);
  setSelectedComment(null);
}}
```
`app/dossier/[id].tsx:649` — same shape, using that file's comment variable.

**Zero-side-effect proof:** `muteUser` is already in scope (`log/[id].tsx:115`, used at
`:682`) and comes from the same `useBlockStore` the adjacent `blockUser` uses. No new import,
no new state, no new render path. The only change is that a button that did nothing now does
what its label says.

---

# 🟠 COMMIT 2 · #126 + #88 + #115 + #116 + #117 — one telemetry pass

**Measured surface — 30 catch blocks, ZERO Sentry:**
```
archiveSlice 3 · interactionSlice 4 · listSlice 5 · watchlistSlice 4
socialSlice 5 (12 logger, 0 Sentry) · logOperations 9 (#88) · logSlice 0 catches
```
**Not intentional:** `captureError` is used in **11 files**, including `auth.ts`,
`blockStore.ts`, `content.ts` and `LogService.ts`. The six domain slices are the outlier.

### The pattern — do NOT blanket-add
```ts
catch (e) {
  if (!isNetworkError(e)) captureError(e, { scope: 'listSlice.createList' });
  // ...existing handling UNCHANGED
}
```
**Why gated:** most of these catches handle EXPECTED offline failures. Reporting them all
floods Sentry and buries real defects — the opposite of observability.

**Zero-side-effect proof:**
- `isNetworkError` is **already imported in 6 of 7 files** (logSlice has none, and 0 catches)
- `captureError` opens `if (!SENTRY_DSN) return;` — **inert without a DSN, cannot throw**
- inserted INSIDE existing `catch` blocks — no new control flow, no new failure path

### Same commit, the three named screens
- **#115** `social-modal.tsx:182` → toast only, **no logger**. `:249` in the SAME file does it
  right (`logger.warn` + toast). Make `:182` match `:249`.
- **#116** `stacks/[id].tsx:387` → `if (__DEV__) console.error(...)` — **invisible in
  production**. Use `logger.warn` + gated `captureError`.
- **#117** `stacks/[id].tsx:511` → `reelToast.error('The collection resists destruction.')`,
  no logging.
- **Also in that file:** `:349` is a bare `catch {` with **no error binding** — it physically
  cannot log. Bind it. `:216` (offline fallback) and `:461` (`isNetworkError` → enqueue) are
  correct; add telemetry only, change no logic. `isNetworkError` already imported here.

---

# 🟡 COMMIT 3 · #120 #124 #108 — remove NAMES, never lines

**Ground truth from `eslint --no-inline-config`** (suppressions ignored):

### #120 · reels.tsx — exactly 4, all inside LIVE declarations
```
:9    useAnimatedScrollHandler   <- import also carries FadeInDown, useDerivedValue,
                                    Easing, withTiming — ALL USED
:175  isCommunityRefetching      <- inside useCommunityFeed()  ┐ the reels screen's
:177  isFollowingRefetching      <- inside useFollowingFeed()  │ ENTIRE data source,
:179  isStacksRefetching         <- inside useStacksFeed()     ┘ consumed :183 :184 :187 :202
```
**Deleting the suppressed LINE empties the reels tab.** Remove the four names, then their
now-redundant `eslint-disable-next-line` comments.

### #124 · compose.tsx — exactly 2
`TactileEngine` (`:10`) — whole import, safe to delete.
`spacing` (`:18`) — sits beside `colors` (used ×35) and `fonts` (×16). **Remove the name
only.**

### #108 · log/[id].tsx:316 — captured, never used, suppression on it
**`:389`'s `previousData` IS used at `:390`.** Delete `:316` and its suppression only.

**Verification for this commit:** after the edits, `npx eslint . --ext .ts,.tsx` must report
**0 problems** with suppressions removed — proving the names were the only dead ones.

---

# 🟢 COMMIT 4 · #69 + #56 — one type field, one comment

### #69 · mappers.ts
Live probe: `list_items?select=position` → **`42703` — column does not exist.**
Both real queries are correct (`listSlice.ts:53`, `ProfileDataService.ts:454` order by
`rank_position`), and `mapListRow` never reads the field.
```ts
export interface ListItemRow {
  id: string; film_id: number; film_title: string;
  poster_path: string | null;
  rank_position: number;      // was: position — that column does not exist
}
```
and `:383` → `// Items arrive pre-sorted via .order('rank_position', { foreignTable: 'list_items' })`
**Contained:** `ListItemRow` has no consumer outside `mappers.ts`.

### #56 · lounge.ts:498-501 — the comment says the OPPOSITE of the code
> `// Prepend offline messages …` `// Wait, fetchMessages maps and reverses them. Let's see.`

The code does `.push()` — append. A reader skimming line one reads **"Prepend"** and could
"fix" the code to match, breaking message order. Replace with the invariant:
```ts
// currentMessages is oldest→newest: the fetch is created_at DESC, then reversed, and the
// UI renders bottom-up. Queued offline messages are the newest, so they append.
```

---

# 🔵 COMMIT 5 · #102 — hitSlop ×2

**MEASURED:** `membership.tsx` `st.manageBtn` = `paddingVertical: 8` + `fontSize: 8`
≈ **26pt tall** against Apple's 44pt minimum.
`:579` (iOS) and `:590` (Android) are mutually exclusive `Platform.OS` branches — 2 code
sites, 1 visible control per device. iOS-only launch makes `:579` the reachable one; **fix
both** so Android is correct when it ships.
```ts
hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
```
Matches the value already used across the app (`log/[id].tsx`, `LogComments.tsx:23`).
`hitSlop` expands the touch area only — it **cannot affect layout**.

---

# ⚪ COMMIT 6 · #4 — eas.json + artifacts

**Commit `eas.json`.** The diff adds `submit.production.ios.ascAppId: "6773105964"`. That ID
appears in every App Store URL — **public, not a secret**. No `appleId` / `appleTeamId` /
`ascApiKey` in the file. It touches `eas submit` only — never builds, never runtime. Without
it, submission prompts or fails in CI.

**Artifacts — decided, so nothing of yours is lost:**
```gitignore
frames/          # 360 generated video frames
*.tmp
```
**Do NOT ignore `generate_*.cjs`** — those are Playwright SOURCE scripts (12.9KB), your work,
not output. `carousel.html` / `post.html` are small and yours to keep or commit; the ignore
rules above do not touch them.

---

# ORDER & RATIONALE
1. **#110** — user-facing bug, smallest change, highest value.
2. **Telemetry** — largest and most valuable; do it while the tree is otherwise quiet.
3. **Dead names** — mechanical, but the highest blast radius if done wrong. Own commit.
4. **Type + comment** — zero runtime.
5. **hitSlop** — zero runtime.
6. **eas.json + ignores** — no code.

All six commits are ONE build. **Nothing in batch 2 touches the database.**

# THE ONE THING THIS PLAN CANNOT PROVE
It has not been executed. Batch 1's record: eight audits, nineteen bugs, **twice in my own
fixes** — and the pattern was always the same, that building finds what reading cannot.
Every claim above is measured. None is yet proven by a green gate.
