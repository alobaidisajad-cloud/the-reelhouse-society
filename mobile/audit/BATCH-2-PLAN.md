# BATCH 2 — THE IN-PLACE EDITS (16) · FLAWLESS PLAN

**Identification (arithmetic, not guesswork):** Tier A = 29 clean. Batch 1 took the 13
deletions (#5 #37 #38 #43 #53 #59 #71 #72 #76 #79 #81 #130 C2). **29 − 13 = 16.**

**Batch 2 = #4 #25 #33 #56 #69 #88 #102 #108 #110 #115 #116 #117 #119 #120 #124 #126**

Every item below re-verified against the CURRENT code this session.

---

## 🔴 TWO FILED FIXES ARE WRONG. Do not execute them as written.

### #110 — "delete unreachable onMute (2 sites)" · **THE HANDLER IS REACHABLE**
Filed as dead code. It is not.

- `app/log/[id].tsx:648` calls `setCommentActionSheetVisible(true)` — the sheet **opens**.
- Inside it, `onBlock` correctly calls `blockUser(selectedComment.user_id)`.
- `onMute` (`:720`) only closes the sheet. **It never mutes anyone.**
- Identical pair in `app/dossier/[id].tsx`: author mute at `:601` works; comment mute at
  `:649` is the same no-op.

So a member opens a comment's action sheet, taps **Mute**, the sheet closes, and nothing
happens. **The button lies.** Deleting the handler removes a control members can see and
expect to work.

**Correct fix — make it mute, mirroring the `onBlock` directly above it:**
```ts
onMute={() => {
  muteUser(selectedComment.user_id);
  setCommentActionSheetVisible(false);
  setSelectedComment(null);
}}
```
`muteUser` is already in scope (`log/[id].tsx:115`, already used at `:682`). Zero new
imports, zero new state. Two sites.

### #33 — "rename the colliding migration file" · **RENAMING AN APPLIED MIGRATION IS DANGEROUS**
Supabase tracks applied migrations **by filename**. Renaming one that is already applied
makes the tooling treat it as NEW and unapplied — a re-run of DDL against production.

Also, the finding understates it: there are **three** colliding dates, not one pair —
`20260526` (2 files), `20260620` (3), `20260621` (2). Seven files. The `20260626_*` and
`20260701_*` families are already correctly sequenced (`_01_`…`_11_`) and must not be touched.

**Verified harmless today:** within each colliding date the files are mutually independent
(founding_members / profile_counts_rpc; claim_founding_seat / drop_legacy_resolve / feed_block;
atomic_delete_list_cascade / ban_enforcement_rls), and lexicographic order is deterministic.
So ordering is implicit but not actually ambiguous in effect.

**Recommendation: DO NOT RENAME.** House rule is "SQL applied MANUALLY via the SQL editor,
never `db push`" — the risk is asymmetric and the benefit is cosmetic. Document the ordering
instead, and adopt the `_NN_` convention for all NEW migrations.

---

## ✅ CONFIRMED, AND THE FILED FIX IS RIGHT

| # | verified state | fix |
|---|---|---|
| **#4** | `eas.json` still shows `M` — uncommitted | commit it; `ascAppId` is public, not a secret |
| **#25** | `scripts/check-backend-live.mjs` exists; **zero callers** in package.json or any workflow | wire it into CI, or delete it — a checker nothing runs is worse than none |
| **#56** | `lounge.ts:500`: *"// Wait, fetchMessages maps and reverses them. Let's see."* | replace with a statement of the invariant |
| **#88** | `logOperations.ts` — **0** `captureError` calls | add telemetry to the log write |
| **#108** | `log/[id].tsx:316` — captured, never used, with an eslint suppression sitting on it | delete the line + its suppression (`:389` IS used at `:390` — leave it) |
| **#120** | `reels.tsx` — 4 unused symbols behind suppressions (`:8 :174 :176 :178`) | delete symbol + suppression together |
| **#124** | `compose.tsx` — 2 unused imports behind suppressions (`:9 :17`) | same |
| **#102** | `membership.tsx` — 4 `hitSlop` across 15 pressables | add `hitSlop` to the 2 sub-44pt controls |
| **#119** | critique send button | add `hitSlop` |

---

## ⚠️ BROADER THAN FILED

### #115 / #116 / #117 — silent failures
Filed as three specific spots. Measured:
- `app/(modals)/social-modal.tsx` — 2 `catch` blocks, **1** logger call
- `app/stacks/[id].tsx` — **5** `catch` blocks, **ZERO** logger calls

Every failure on the stacks screen is silent. Fix the whole file, not the two named lines.

### #126 + #88 — the substantial item in this batch
**All six domain slices have ZERO error telemetry:**
```
archiveSlice 0 · interactionSlice 0 · listSlice 0
logSlice 0 · socialSlice 0 · watchlistSlice 0
```
This is where filing a log, adding to a watchlist, and editing a stack happen. If any of it
breaks for a real member, **nothing reports it**. #88 is a subset of #126 — do them as one
change, not two.

**Zero-side-effect proof:** `captureError` opens with `if (!SENTRY_DSN) return`, so it is
inert without a DSN and cannot throw into a catch block. It is added INSIDE existing
`catch` blocks — no new control flow, no new failure path.

---

## #69 — needs one more read before I state a fix
`mappers.ts:10` claims *"Every function is TYPED — no `any`"*. The finding says the type and
the comment disagree. I have not yet located the contradicting `any`, so I am not writing a
fix I cannot justify. **Not included in the execute list until read.**

---

## ORDER
1. **#4** — one commit, no code.
2. **#110** ×2 — the only user-facing bug in this batch. A visible control that does nothing.
3. **#126 + #88 + #115/#116/#117** — one telemetry pass across the store layer and the two
   screens. The largest and most valuable piece.
4. **#108 #120 #124** — dead symbols, each with its eslint suppression.
5. **#102 #119** — hitSlop.
6. **#56** — the comment.
7. **#25** — wire the checker into CI or delete it (your call: it is a product decision
   about whether the contract is enforced).
8. **#33** — **recommend NO ACTION**; document instead.
9. **#69** — after I read it.

All of batch 2 is one build. Nothing here is SQL, and nothing here touches the database.
