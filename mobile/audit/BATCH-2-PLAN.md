# BATCH 2 — THE 16 IN-PLACE EDITS · FINAL PLAN

**Identification:** Tier A = 29 clean. Batch 1 took the 13 deletions
(#5 #37 #38 #43 #53 #59 #71 #72 #76 #79 #81 #130 C2). **29 − 13 = 16.**

**Batch 2 = #4 #25 #33 #56 #69 #88 #102 #108 #110 #115 #116 #117 #119 #120 #124 #126**

Every item below opened and read this session. Where I could not verify, I say so.

---

## 🔴 THREE FINDINGS WHOSE OBVIOUS EXECUTION BREAKS THE APP

### #120 — "delete 4 dead symbols in reels.tsx"
**The COUNT is right. Executing it as written destroys the reels tab.**

Ground truth from `eslint --no-inline-config` (suppressions ignored) — exactly 4 unused:
```
reels.tsx:9    useAnimatedScrollHandler
reels.tsx:175  isCommunityRefetching
reels.tsx:177  isFollowingRefetching
reels.tsx:179  isStacksRefetching
```
But those names sit INSIDE live declarations. Lines 175/177/179 are
`useCommunityFeed()` / `useFollowingFeed()` / `useStacksFeed()` — **the entire data
source for the screen** (consumed at `:183 :184 :187 :202`). Line 9 is the Reanimated
import that also carries `FadeInDown`, `useDerivedValue`, `Easing`, `withTiming` — all used.

**Correct fix:** remove the four NAMES from their destructures/import, then delete the four
now-unnecessary `eslint-disable-next-line` comments. Never delete the suppressed LINE.

### #124 — "delete 2 dead symbols in compose.tsx" — same trap
Genuinely unused: `TactileEngine` (:10) and `spacing` (:18).
But `spacing` is destructured alongside `colors` (used ×35) and `fonts` (used ×16).
**Remove `spacing` from the import list; do not delete the import line.**

### #110 — "delete unreachable onMute (2 sites)" — **THE HANDLER IS REACHABLE**
`log/[id].tsx:648` calls `setCommentActionSheetVisible(true)`; the sheet opens. Inside it
`onBlock` correctly calls `blockUser(...)`. `onMute` (`:720`) only closes the sheet —
**it never mutes anyone.** Identical pair in `dossier/[id].tsx` (author mute at `:601`
works; comment mute at `:649` is the same no-op).

A member taps **Mute** on a comment and nothing happens. **The button lies.**
Deleting it removes a control members can see.

**Correct fix — make it mute, mirroring the `onBlock` above it:**
```ts
onMute={() => {
  muteUser(selectedComment.user_id);
  setCommentActionSheetVisible(false);
  setSelectedComment(null);
}}
```
`muteUser` already in scope (`log/[id].tsx:115`, used at `:682`). Zero new imports.

---

## ⚠️ #33 — RECOMMEND NO ACTION

Filed: "rename the colliding migration file."
**Supabase tracks applied migrations BY FILENAME.** Renaming one already applied makes the
tooling treat it as new and re-run DDL against production.

Also under-counted: **three** colliding dates, not one pair — `20260526` (2 files),
`20260620` (3), `20260621` (2). The `20260626_*` (01–11) and `20260701_*` families are
already correctly sequenced and must not be touched.

**Verified harmless today:** within each colliding date the files are mutually independent
(founding_members / profile_counts_rpc · claim_founding_seat / drop_legacy_resolve /
feed_block_filtering · atomic_delete_list_cascade / ban_enforcement_rls), and lexicographic
order is deterministic. Ordering is implicit but not ambiguous in effect.

**Recommendation:** do not rename. Adopt `_NN_` for all NEW migrations. Risk is asymmetric;
benefit is cosmetic.

---

## ✅ CONFIRMED — fix as filed

### #126 + #88 — THE SUBSTANTIAL ITEM. Do them as ONE change.
```
archiveSlice 0 · interactionSlice 0 · listSlice 0
logSlice 0 · socialSlice 0 · watchlistSlice 0     <- captureError calls
logOperations.ts 0                                <- #88, a subset of #126
```
This is where filing a log, adding to a watchlist and editing a stack happen. If any of it
breaks for a real member, **nothing reports it.**
**Zero-side-effect proof:** `captureError` opens with `if (!SENTRY_DSN) return` — inert
without a DSN, cannot throw. Added INSIDE existing `catch` blocks: no new control flow.

### #115 · social-modal — one silent catch, confirmed exactly
`:182` → `reelToast.error(...)` only, **no logger**. `:249` in the SAME file → `logger.warn`
+ toast. Fix `:182` to match `:249`.

### #116 / #117 · stacks/[id].tsx — 5 catch blocks, **0** `logger.` calls
`:387` uses `if (__DEV__) console.error(...)` — **invisible in production.**
`:216` is a deliberate offline fallback (handles the error; leave its logic, add telemetry).
Fix the file, not the two named lines.

### #69 · mappers — cosmetic, exactly as filed ("zero runtime")
`ListItemRow` declares `position: number`; live probe: `list_items.position` → **42703, does
not exist**. The comment at `:383` claims `.order('position', …)`.
**Both queries are correct** — `listSlice.ts:53` and `ProfileDataService.ts:454` order by
`rank_position`. And `mapListRow` never reads `i.position`.
Fix: rename the type field to `rank_position`, correct the comment.
**Contained:** `ListItemRow` has no consumer outside `mappers.ts`.

### #108 · log/[id].tsx:316 — captured, never used, suppression sitting on it
`:389`'s `previousData` IS used at `:390`. **Only delete `:316` and its suppression.**

### #102 · membership.tsx — exactly two, confirmed
`:579` and `:590`, both `st.manageBtn`, neither has `hitSlop`. They are mutually exclusive
`Platform.OS` branches — 2 code sites, 1 visible control per device. iOS-only launch means
`:579` is the reachable one; fix both.

### #56 · lounge.ts:500 — confirmed verbatim
`// Wait, fetchMessages maps and reverses them. Let's see. The fetch order is 'created_at'
descending, so newest first.` → replace with a statement of the invariant.

### #4 · eas.json — still shows `M`, uncommitted. Commit it (`ascAppId` is public).

### #25 · scripts/check-backend-live.mjs — **zero callers** in package.json and every workflow
A contract checker nothing runs is worse than none: it reads as coverage and provides none.
**Decide: wire into CI, or delete.** Recommend wiring — it is the only thing that would
catch a #84-class column drift.

---

## ❓ #119 — CANNOT VERIFY. Not actioning on the note alone.
Filed: "the critique send button is a ~30px tap target with no `hitSlop`."
Searched `log/[id].tsx`, `LogComments.tsx`, `LogActionDeck.tsx`, `LogForm.tsx`,
`ShareToLoungeModal.tsx`. Found no control matching that description:
- `LogForm.tsx:375` submit **has** `hitSlop={{top:15,bottom:15}}` (no left/right — arguably
  the real finding, but that is a different claim)
- `ShareToLoungeModal.tsx:218` `sendBtn` is a full-width bar, `paddingVertical: 14`

Either already fixed, or the finding names a control I have not identified.
**I will not write a fix for a control I cannot point at.** Needs the file named.

---

## 🆕 NEW — surfaced by running eslint without suppressions
`app/dispatch/compose.tsx:77` — `react-hooks/exhaustive-deps`: useEffect missing dependency
`edit`. A stale-closure risk, not in the register. Worth its own look; **not** silently
bundled into #124.

---

## ORDER
1. **#110** ×2 — the only user-facing bug here. A visible control that does nothing.
2. **#126 + #88 + #115 + #116 + #117** — one telemetry pass. The largest, most valuable piece.
3. **#120 #124 #108** — the four + two + one names. **Names, not lines.**
4. **#69 #56** — type + two comments.
5. **#102** — hitSlop ×2.
6. **#4** — commit eas.json.
7. **#25** — wire the checker into CI (or delete — your call).
8. **#33** — NO ACTION recommended.
9. **#119** — blocked on identifying the control.

All of batch 2 is ONE build. Nothing here touches the database.
