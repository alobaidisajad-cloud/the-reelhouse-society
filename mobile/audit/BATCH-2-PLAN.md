# BATCH 2 — ALL 16 IN-PLACE EDITS · FINAL PLAN

**Identification:** Tier A = 29 clean. Batch 1 took the 13 deletions
(#5 #37 #38 #43 #53 #59 #71 #72 #76 #79 #81 #130 C2). **29 − 13 = 16.**

**Scope: #4 #25 #33 #56 #69 #88 #102 #108 #110 #115 #116 #117 #119 #120 #124 #126**

Every one opened, read, and measured this session. **4 are not actionable. 3 would break
the app if executed as filed. 9 are real. 1 new finding surfaced.**

---

# ❌ NOT ACTIONABLE (4)

### #25 — FALSE POSITIVE. The system already works.
Filed: *"contract checker (script, zero callers)."*
- `scripts/check-backend-live.mjs` is a **deliberately manual deploy-time tool**. Its own
  header documents the invocation: `SUPABASE_DB_URL=postgres://… node scripts/check-backend-live.mjs`
- Its CI companion **exists and passes**: `__tests__/backendContract.test.ts` — 2 tests,
  green — re-derives every `.rpc()` and edge-function call the app makes and asserts the
  contract matches.
- Wiring the script into CI requires a **postgres connection string in GitHub secrets** — a
  materially worse attack surface than the anon key.
- And it *"skips with a warning if config/tool is unavailable"*, so wiring it WITHOUT
  secrets produces a job that always passes and checks nothing.
**→ NO ACTION.** Automated code-side guard in CI + manual live probe at deploy is correct.

### #33 — RECOMMEND NO ACTION. The fix is more dangerous than the defect.
**Supabase tracks applied migrations BY FILENAME.** Renaming one already applied makes the
tooling treat it as new and re-run DDL against production.
Under-counted too: **three** colliding dates — `20260526` (2), `20260620` (3), `20260621` (2).
`20260626_*` (01–11) and `20260701_*` are already correctly sequenced; do not touch them.
**Verified harmless:** within each colliding date the files are mutually independent
(founding_members / profile_counts_rpc · claim_founding_seat / drop_legacy_resolve /
feed_block_filtering · atomic_delete_list_cascade / ban_enforcement_rls). Lexicographic order
is deterministic, so ordering is implicit but not ambiguous in effect.
**→ Adopt `_NN_` for NEW migrations. Leave applied ones alone.**

### #119 — FALSE POSITIVE. The control already has hitSlop.
Filed: *"critique send button is a ~30px tap target with no hitSlop."*
Found it: `src/components/log/LogComments.tsx`, `onPress={onPostComment}` / "FILE CRITIQUE".
It carries `hitSlop={HITSLOP}` where `HITSLOP = {top:15,bottom:15,left:15,right:15}` (`:23`) —
+30pt in both dimensions, clearing 44pt from any realistic base size.
**→ NO ACTION.**

### #69 — real, but purely cosmetic (exactly as filed: "zero runtime")
Live probe: `list_items?select=position` → **`42703` column does not exist.**
`ListItemRow` (`mappers.ts:356`) declares `position: number`; the comment (`:383`) claims
`.order('position', …)`.
**But both real queries are correct** — `listSlice.ts:53` and `ProfileDataService.ts:454`
both `.order('rank_position', { foreignTable: 'list_items' })`. And `mapListRow` never reads
`i.position` (it maps `film_id`, `film_title`, `poster_path` only).
**Fix:** rename the type field to `rank_position`; correct the comment.
**Contained:** `ListItemRow` has no consumer outside `mappers.ts`.

---

# 🔴 EXECUTION TRAPS — the filed instruction breaks the app (3)

### #120 — "delete 4 dead symbols in reels.tsx"
**Count verified correct** by `eslint --no-inline-config` (suppressions ignored). Exactly 4:
```
:9    useAnimatedScrollHandler
:175  isCommunityRefetching
:177  isFollowingRefetching
:179  isStacksRefetching
```
**But every one sits INSIDE a live declaration.** Lines 175/177/179 are
`useCommunityFeed()` / `useFollowingFeed()` / `useStacksFeed()` — **the reels screen's entire
data source**, consumed at `:183 :184 :187 :202`. Line 9 is the Reanimated import also
carrying `FadeInDown`, `useDerivedValue`, `Easing`, `withTiming` — all in use.
**Deleting the suppressed LINE empties the reels tab.**
**→ Remove the four NAMES, then their now-redundant suppression comments.**

### #124 — same trap
Genuinely unused: `TactileEngine` (`:10`) and `spacing` (`:18`).
`spacing` is destructured beside `colors` (used ×35) and `fonts` (×16).
**→ Remove `spacing` from the import list. Do not delete the line.**

### #110 — "delete unreachable onMute (2 sites)" — **IT IS REACHABLE**
`log/[id].tsx:648` calls `setCommentActionSheetVisible(true)` — the sheet opens. Inside it
`onBlock` correctly calls `blockUser(...)`. `onMute` (`:720`) only closes the sheet.
Identical pair in `dossier/[id].tsx` (author mute `:601` works; comment mute `:649` no-op).
**A member taps Mute on a comment and nothing happens. The button lies.**
```ts
onMute={() => {
  muteUser(selectedComment.user_id);
  setCommentActionSheetVisible(false);
  setSelectedComment(null);
}}
```
`muteUser` already in scope (`log/[id].tsx:115`, used at `:682`). Zero new imports.

---

# ✅ REAL — fix as filed (9)

### #126 + #88 — THE SUBSTANTIAL ITEM. One change, not two.
Measured surface — **30 catch blocks, zero Sentry:**
```
archiveSlice 3 · interactionSlice 4 · listSlice 5 · watchlistSlice 4
socialSlice 5 (12 logger, 0 Sentry) · logOperations 9 (#88) · logSlice 0 catches
```
This is where filing a log, adding to a watchlist and editing a stack happen.

**⚠️ Do NOT blanket-add.** Most of those catches handle EXPECTED offline failures; reporting
them all floods Sentry and buries real defects.

**The premium fix — gate on the discriminator already present in the file:**
```ts
catch (e) {
  if (!isNetworkError(e)) captureError(e, { scope: 'listSlice.createList' });
  // ...existing handling unchanged
}
```
**Zero-side-effect proof:**
- `isNetworkError` is **already imported in 6 of 7 files** (logSlice has none — and 0 catches)
- `captureError` opens `if (!SENTRY_DSN) return;` — **inert without a DSN, cannot throw**
- added INSIDE existing catches — no new control flow, no new failure path

### #115 — social-modal, one silent catch (confirmed exactly)
`:182` → `reelToast.error(...)` only, **no logger**. `:249` in the SAME file → `logger.warn` +
toast. Make `:182` match `:249`.

### #116 — stacks comments fetch, invisible in production
`stacks/[id].tsx:387` → `if (__DEV__) console.error(...)`. Real members' failures vanish.

### #117 — stack deletion, toast only
`stacks/[id].tsx:511` → `reelToast.error('The collection resists destruction.')`, no logging.

**Bonus in the same file:** `:349` uses bare `catch {` with **no error binding** — it
physically cannot log. `:216` (offline fallback) and `:461` (`isNetworkError` → enqueue) are
correct and need only telemetry, not logic changes. `isNetworkError` is already imported here.

### #56 — the comment contradicts the code, and that is a regression risk
`lounge.ts:498-501`:
> `// Prepend offline messages …` `// Wait, fetchMessages maps and reverses them. Let's see.`
> `// … So we need to append offline messages to the end.`

The code does `.push()` — append. A reader skimming line one sees **"Prepend"** and could
"fix" the code to match, breaking message order.
**Replace with the invariant:** *fetch is `created_at` DESC then `.reverse()` → oldest-first;
the UI renders bottom-up; queued messages are the newest, so they append.*

### #102 — MEASURED, confirmed
`membership.tsx:579` and `:590`, both `st.manageBtn`:
`paddingVertical: 8` + `fontSize: 8` ≈ **26pt tall** vs Apple's 44pt minimum.
Mutually exclusive `Platform.OS` branches — 2 sites, 1 visible per device. iOS-only launch
makes `:579` the reachable one; fix both.

### #108 — one dead line, one live one
`log/[id].tsx:316` — captured, never used, suppression sitting on it. **`:389`'s `previousData`
IS used at `:390`.** Delete `:316` and its suppression only.

### #4 — commit `eas.json`
Diff adds `submit.production.ios.ascAppId: "6773105964"`. That ID appears in every App Store
URL — **public, not a secret**. No `appleId` / `appleTeamId` / `ascApiKey` in the file.
Touches `eas submit` only — never builds, never runtime. Without it, submission prompts or
fails in CI.
**⚠️ The "gitignore artifacts" half:** the untracked files are `generate_*.cjs` (8),
`carousel.html`, `post.html`, `frames/` — **your marketing scripts, not junk.** Only
`mobile/real.tmp` is genuinely disposable. **Decide before ignoring: these are work.**

---

# 🆕 NEW — found by running eslint without suppressions
`app/dispatch/compose.tsx:77` — `react-hooks/exhaustive-deps`: `useEffect` missing dependency
`edit`. A stale-closure risk on the dossier editor. **Not in the register.** Flagged
separately, not silently folded into #124.

---

# ORDER
1. **#110** ×2 — the only user-facing bug in this batch. A visible control that does nothing.
2. **#126 + #88 + #115 + #116 + #117** — one telemetry pass, gated on `isNetworkError`.
3. **#120 #124 #108** — remove the NAMES, never the lines.
4. **#69 #56** — one type field, two comments.
5. **#102** — hitSlop ×2.
6. **#4** — commit eas.json; decide on the marketing scripts.
7. **#25 #33 #119** — **NO ACTION** (documented above).
8. **NEW** — the compose `useEffect` dependency, separately.

All of batch 2 is ONE build. Nothing here touches the database.
