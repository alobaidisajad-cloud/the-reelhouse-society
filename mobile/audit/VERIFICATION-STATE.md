# Audit Verification State — handoff

**Task:** deep-verify all 131 findings in `audit/all-131-findings.txt`, starting at #1, in order.
For each: (1) prove it's real, (2) prove it's not intentional, (3) design the best fix, (4) prove zero side effects.

---

## ⚠️ LIVE SECURITY BREACH — fix before anything else

Unauthenticated `curl` with only the public anon key returned a real member's private note:

```json
{"film_title":"The Shawshank Redemption","private_notes":"watched it in my darkest day "}
```

**Mechanism (fully proven):**
1. `logs_select_authorized ON public.logs FOR SELECT USING (can_view_user_data(user_id))`
2. `can_view_user_data()` returns TRUE for any **public** profile — including to `anon`
3. RLS is row-level → once the row is visible, all 27 columns come with it
4. `private_notes` is NOT column-revoked (whereas `profiles.email` IS — proving the team knows the technique)

**Proven NOT intentional.** Three client-side privacy layers exist:
- `mappers.ts:186` — `PUBLIC_LOG_COLUMNS` explicitly omits `private_notes`
- `LogReviewBody.tsx:86` — `{isOwner && privateNotes && (`
- `LogForm.tsx:337` — placeholder: "Notes only you can see..."
- Across all 63 migrations, `private_notes` appears ONCE (a JSON builder). No DB control was ever applied.

**Stage 1 fix — zero risk, apply now:**
```sql
REVOKE SELECT (private_notes) ON public.logs FROM anon;
```
Verified safe: all four read paths run under an authenticated session
(`LOG_SELECT_COLUMNS` own-log fetch, `LogService.ts:153`, `mutationExecutor.ts:75/124`,
`app/log/[id].tsx:599`). No anonymous log-read path exists.

**Stage 2 (NOT yet zero-risk — needs its own pass):** revoke from `authenticated` too and
reroute the owner's read through a `SECURITY DEFINER` accessor. Touches offline merge logic
in `mutationExecutor` — the most failure-sensitive code in the app.

---

## Verified this session (~42 of 131) — do not redo

### Retracted — FALSE POSITIVE
- **#77** "Offline follows silently discarded" — **WRONG.** They queue correctly:
  `enqueueMutation({type:'follow_user'})` + toast, executors at `mutationExecutor.ts:478/515`.

### Already annotated in transcript
- **#15** — marked **INTENTIONAL** (notify-push fail-open)
- **#11** — marked confirmed

### Severity upgrades (both were understated)
- **#26 → Blocking** (see above)
- **#32 → needs re-scoping.** `get_featured_critique()` IS `SECURITY DEFINER RETURNS SETOF public.logs`,
  BUT migration `20260709_05` redefines it to exclude private authors, AND the client
  (`FeaturedCritique.tsx:31`) calls it with an explicit column list that OMITS `private_notes`.
  **The DB function still over-returns; the app doesn't request it. Narrower than first filed — re-verify.**

### Duplicates
- **#38 ≡ #127** (DossierService dead)
- **#44 ≡ #128** (`getLogComments` unbounded)

### Scope corrections
- **#76** — ~2x OVERSTATED. `withAbortSignal` = 42 live refs, `withTimeout` = 13.
  Only `apiCircuitBreaker` + `qos` are dead (~200 lines, not 466).
- **#75** — four `timeAgo` impls, not three (`utils/timeAgo.ts`, `ActivityCard.tsx`,
  `home/types.ts`, `app/log/[id].tsx`)
- **#83** — 2 of 21 sites, not 1 of 21
- **#65** — STALE. Code is clean; TMDB key only in git history → rotate-if-repo-goes-public

### Confirmed exactly as filed (30)
#84 (`42703` live on `logs.username` AND `logs.role`) · #42 (body verified, no migration redefines) ·
**#48 (LIVE: your admin account is `role=admin, tier=projectionist` → `normalizeTier` falls through to
`cinephile`; you have no Vault/autopsy/lounge/dossier access on your own app)** ·
**#51 (`MAX_NOTIFICATIONS=50` vs fetch `slice(0,500)` → one push destroys up to 450 loaded items)** ·
#28 (exactly 24 missing `search_path` of 49) · #29 (exactly 9 dup indexes) · #93 (0 length CHECKs) ·
#68 (`listSlice` has 0 `sanitizeInput` calls) · #82 (0 `invalidateQueries` in socialSlice) ·
#80 (2 "refs" = dead barrel + a comment) · #58 (`_lastCreateAt = now` set BEFORE insert) ·
#67 · #73 · #74 · #71 · #62 · #55 · #56 · #57 · #59 · #37 · #41 · #43 · #35 · #63 · #129

### Unresolved — do not assert
- **#52** — no `_hasMore` symbol in `lounge.ts`; file misattributed
- **#69** — client uses `rank_position` correctly everywhere; likely about `replace_list_items` RPC
- **#78** — the `removeRequested` calls found are in `followUser`, not offline `unfollowUser`

---

## Remaining: ~89 findings (start at #1, skip those listed above)

**Observed error rate on my own catalogue: ~30%.** Expect ~3 more false positives and
~6 more mis-severities in the unverified remainder. Verify, don't trust the note.

## Useful facts
- Live probes work: `EXPO_PUBLIC_SUPABASE_URL` + anon key in `.env`
- PostgREST oracle: `42703` = column absent · `PGRST202` = fn signature absent ·
  `42501` = exists but grant denied · `PGRST200` = relationship missing
- House rules: SQL applied MANUALLY via Supabase SQL editor (never `db push`);
  ship to `main` + `origin/main`, no branches
- Full transcript: `C:\Users\OMEN\.claude\projects\C--Users-OMEN-OneDrive-Desktop-divisionops-reelhouse-mobile\fd8a6e2a-90bf-4eae-99a5-2b82ae9fdf7d.jsonl`
- Findings 13-22 are in TABLE format in that transcript (`| 13 | ...`), not `#NN` headers
