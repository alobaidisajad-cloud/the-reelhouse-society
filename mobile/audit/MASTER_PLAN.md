# ReelHouse — Master Plan to a Masterpiece
### Verified findings + elite fixes + execution sequence

> Every finding below was re-examined for **false-positive risk** and assigned a **verdict**. HIGH/MEDIUM items were re-verified with fresh code reads this pass; LOW items were verified during the line-by-line layer audit (locations cited in `audit/findings/*`). 51 findings total (50 + SHADOWBAN-1 surfaced during re-verification).
>
> **Verdict legend:** ✅REAL (confirmed) · ⚠️VERIFY-LIVE (code is wrong; confirm prod wasn't hand-patched) · 🟡CONDITIONAL (real only if a feature ships) · ❌FALSE-POSITIVE (none found — every flagged item is real).

---

## The shape of the work (read this first)
1. **The client is near-elite; the risk is the backend.** The serious defects cluster in the **early `0002`/`20260429`-era migrations** — "aspirational hardening" that silently doesn't work (typo'd `DROP POLICY`, unconditional protect-triggers, OR-defeated shadowban). Recent migrations (20260609+) are rigorous. Fixing this era is the heart of the plan.
2. **The one structural weakness is testing:** CI runs Jest with a **mocked Supabase** → 0% coverage of triggers/RLS/edge functions, which is exactly where all 4 open HIGH findings live. **A Supabase-branch integration test job is the single highest-leverage investment** — it both catches these and prevents regression.
3. **Verify-live before fixing the trigger findings.** PROFILE-FREEZE-1 and SHADOWBAN-1 are so severe that if they were live the app would visibly misbehave; since live testing hasn't begun they may be latent, OR prod was hand-patched and the migrations are stale. Either way: dump the live definitions first (one psql session), then fix code + DB together so a fresh deploy/DR can't reintroduce them.

---

## WAVE 0 — Verify-live (1 short session, before any backend code change)
Run against the live DB and capture output into `audit/live-db-state.md`:
```sql
-- PROFILE-FREEZE-1 / video metrics
SELECT pg_get_functiondef('public.protect_profile_fields'::regproc);
SELECT pg_get_functiondef('public.protect_video_review_metrics'::regproc);
-- NOTIF-SPOOF-1: is the permissive INSERT policy still present?
SELECT polname, pg_get_expr(polwithcheck, polrelid) FROM pg_policy
  WHERE polrelid='public.notifications'::regclass;
-- SHADOWBAN-1: is the shadowban policy live alongside the privacy policy?
SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid='public.logs'::regclass;
-- duplicate interaction notif triggers (NOTIF-DUP-1)
SELECT tgname FROM pg_trigger WHERE tgrelid='public.interactions'::regclass AND NOT tgisinternal;
-- EMAIL-ENUM-1 grant
SELECT proname, proacl FROM pg_proc WHERE proname='get_email_by_username';
-- PAY secret presence (do NOT print value, just existence)
```
This single session resolves the ⚠️VERIFY-LIVE flags and tells you whether each fix is "change code+migration" or "migration only."

---

# WAVE 1 — HIGH severity (ship-blockers)

### 1. BACKEND-PROFILE-FREEZE-1 — ⚠️VERIFY-LIVE, then fix (CRITICAL if live)
**Verdict: REAL.** Re-verified: `protect_profile_fields` (0002_rls_hardening, never superseded) reverts `role/tier/followers_count/following_count/total_logs` on every UPDATE; BEFORE-triggers fire for service-role + SECURITY DEFINER triggers; `premium_rls` reads `profiles.tier`; the profile screen reads `profiles.followers_count` (`user/[username].tsx:796`) — **not** from `get_profile_counts` (which omits follower counts). So both the tier-freeze and the count-freeze are real and user-visible. Repeated in `protect_video_review_metrics`.
**Elite fix:**
- Drop `followers_count`/`following_count`/`total_logs` from the trigger entirely — they are *derived counters* legitimately written by SECURITY DEFINER triggers (which run under the follower's `authenticated` role, so an `auth.role()` guard would NOT save them — they must simply not be protected).
- Keep protection for **`tier`** only, guarded by `IF auth.role() = 'authenticated' THEN NEW.tier := OLD.tier`. Service-role (`sync-entitlement`) is `service_role` → passes through.
- Delete the redundant `NEW.role` revert here; make the surgical `check_role_update` (20260504) the single role guard.
- Same surgery for `protect_video_review_metrics` (drop views/tip_total reverts).
- Belt-and-suspenders: switch follower counts to a periodic reconcile or trust the triggers once unblocked; add the integration test below.
**Regression test (integration):** follow → target.followers_count increments; client UPDATE can't change role/tier; service-role can.

### 2. BACKEND-NOTIF-SPOOF-1 — ✅REAL (one-line fix)
**Verdict: REAL.** Exact-string proof: CREATE `"…notifications"` vs DROP `"…notifications."` (trailing period) → silent no-op; no replacement policy; permissive `WITH CHECK (auth.role()='authenticated')` still live → any authed user inserts notifications to anyone.
**Elite fix:** new migration: `DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;` (correct name). Do **not** re-add a client INSERT policy — the SECURITY DEFINER notification triggers bypass RLS, so clients need no direct insert. Optional explicit `WITH CHECK (false)` INSERT policy to document intent. **Test:** a non-service client `insert` into notifications for another user fails.

### 3. BACKEND-PAY-1 — ✅REAL (gated on PayTabs shipping)
**Verdict: REAL.** `WEBHOOK_SECRET = env || 'dev-secret-123'`; IPN authed only by URL `?token=`; no HMAC over body.
**Elite fix:** (a) remove the `'dev-secret-123'` fallback — throw on missing env (fail closed); (b) verify PayTabs' real HMAC `signature` header over the raw request body (constant-time compare); (c) add idempotency keyed on PayTabs `tran_ref` (dedupe replays); (d) keep `cart_id` server-built (already is). If web/PayTabs checkout isn't live yet, do this before it ships.

### 4. BACKEND-SHADOWBAN-1 — ✅REAL (dormant landmine) + drives HOOK-1
**Verdict: REAL but currently INERT** (re-verified: shadowban logs-RLS is OR-defeated by `can_view_user_data`; `trust_score` read nowhere; 20260429 also failed to drop the real permissive policy by name). So no active shadowban today — but a latent censorship mechanism: any future "fix" to the privacy-OR interaction would activate mass shadowbans from accumulated `-25` deductions, with no review/appeal/notification.
**Elite fix (decide intent):**
- **If shadowban is NOT wanted (recommended):** drop the `process_user_report` trigger + the "Elite Public Feed (Shadowban Enforced)" policy + reconsider the `user_reports` table; route all reports to the Tribunal (`reports`) — fixes HOOK-1 too.
- **If automated trust is wanted:** make it a deliberate, RESTRICTIVE policy with an admin-review threshold (e.g., auto-flag for Tribunal at N reports, never auto-hide without review), dedup across content (not just per-log), and a user notification + appeal path.

---

# WAVE 2 — MEDIUM severity (correctness, trust, privacy, money)

### 5. BACKEND-PAY-2 + premium tier/role consistency — ✅REAL
PayTabs sets `is_founding` directly (bypasses atomic `claim_founding_seat`) → web founding over-sell; and `premium_rls` gates on `tier` while PayTabs writes only `role` → payers locked out of premium (compounded by PROFILE-FREEZE-1).
**Elite fix:** route the PayTabs founding grant through `claim_founding_seat(user_id)` (honor its boolean: grant auteur, set is_founding only if a seat remains), mirroring `sync-entitlement`; and gate `premium_rls` on the **resolved tier** (a `resolve_tier(profiles)` SQL helper mirroring the client's `resolveTier`: role + is_founding + tier) so all pay paths converge. Single source of truth for "is premium" in SQL.

### 6. BACKEND-PRIV-1 — ✅REAL
`get_public_profile_analytics` lacks a `can_view_user_data` gate (re-verified vs `get_user_analytics`, which correctly does own-only). Any authed user reads a private user's aggregate analytics.
**Elite fix:** add `IF NOT can_view_user_data(p_user_id) THEN RETURN '{"error":"forbidden"}'::jsonb` at the top; add `STABLE` + `SET search_path=public` (it lacks both).

### 7. BACKEND-EMAIL-ENUM-1 — ✅REAL
`get_email_by_username` → PUBLIC execute (anon), no rate-limit; usernames public → mass email harvest.
**Elite fix:** the username-login UX needs username→email pre-auth, but not an open bulk oracle. Best: a single `sign_in_with_username` path that resolves + initiates auth server-side without returning the email; pragmatic interim: per-IP rate-limit (e.g., pg + edge) + monitoring, and `REVOKE` direct broad access. (Consider email-only login to retire the oracle entirely.)

### 8. BACKEND-SANITIZE-1 (folds COMP-1) — ✅REAL
The `sanitize-input` edge fn is wired to nothing → **no server-side sanitization exists**; the only sanitization is the client util, applied inconsistently (offline yes / online no — COMP-1).
**Elite fix:** make sanitization a **single server-side choke point**: a `sanitize_text(input, kind)` SQL/Deno helper invoked by the write RPCs (or a BEFORE-INSERT trigger on comment/review tables) so it cannot be bypassed by any client path. Then the client util becomes a UX nicety, not the security boundary. Delete the dead edge fn (or wire it). Fix its profanity regex (`\bn+i+g+` false-positives `night_owl`/`nightmare`) before any use.

### 9. COMP-1 — ✅REAL (ownership half already server-fixed)
Online comment writes (log/stack/dossier) skip `sanitizeInput` while offline sanitizes; dossier-comment ownership is now DB-enforced (20260625) so only the **sanitize inconsistency** remains.
**Elite fix:** move `sanitizeInput` into `LogService.addLogComment` / `StackService.addStackComment` / `DossierService.addComment` so online+offline share one choke point — and back it with #8's server-side enforcement.

### 10. COMP-1-orig (preference double-write) — ✅REAL (line-proven)
`updateUser({preferences})` → `ProfileWriteService.updateProfile:52,67` full-column overwrite, fired un-awaited alongside the `update_my_preferences` merge RPC (`ProgrammesSection:127/136`) → races, can clobber concurrent cross-device pref changes.
**Elite fix:** route ALL preference writes through `update_my_preferences` (the verified JSONB-merge RPC) / `auth.setPreference`; **remove `preferences` from `ProfileWriteService.updateProfile`'s field set** so the full-blob overwrite path is impossible.

### 11. COMP-SPOILER-1 — ✅REAL (5 surfaces confirmed)
`is_spoiler` collected/persisted/read but consumed by **no** UI (feed/log-detail/pulse/film-reviews/read-all all render unguarded).
**Elite fix:** reader-side blur + tap-to-reveal in `LogReviewBody`; thread `is_spoiler` into `feed.schema` + `ReviewContent` + `FilmReviews`' `CommunityReview` type for a feed/film spoiler veil. Data already flows; this is display-only.

### 12. BACKEND-NOTIF-DUP-1 — ✅REAL (both triggers confirmed live)
Two AFTER-INSERT triggers on `interactions` both insert notifications (one also increments counts) → every follow/request/endorse double-notifies, often with two different `type` strings.
**Elite fix:** `DROP TRIGGER tr_notify_interaction` (the `notify_on_interaction` path, no counts); keep `on_interaction_created`/`handle_interaction_notification`. Reconcile the surviving `type` strings (`reaction` vs `endorse`) with what `notificationStore` renders (ties to NOTIF-1/SVC-1). Test: 1 interaction → exactly 1 notification row.

### 13. NOTIF-1 — ⬇️ DOWNGRADED to LOW (re-verify corrected an overstatement)
Originally flagged as "one invalid row blanks the notifications screen." **Re-verification proved that's not realizable:** `notifications.message` is `NOT NULL` + a `type` CHECK constraint → malformed rows can't be persisted (SVC-1's broken insert *fails* rather than storing a bad row), and on `safeParse` failure the store `return`s keeping MMKV-cached data (never blank). Real residual is only a robustness nit.
**Elite fix (LOW):** switch the two `z.array().safeParse` calls to per-row salvage so a future schema-drift row can't silently no-op the whole refresh. No urgency.

### 14. SVC-1 — ✅REAL, SHARPENED (silent notification loss, not just "divergent shapes")
**Re-verification upgraded the precision:** the offline `add_list_comment` notification insert (`mutationExecutor:333-339`) writes `{type:'list_comment', actor_id, reference_id, entity_id}` — 3 columns that exist in **no migration**, an **invalid `type`** (violates the CHECK constraint), and **no `message`** (NOT NULL). It isn't `throwIfError`-wrapped → **fails silently → offline list-comments never notify the owner.** (Online path is fine.)
**Elite fix:** emit list-comment notifications from a DB trigger (single source of truth, like follow/endorse), and delete the hand-crafted client insert; or, minimally, fix the offline insert to the canonical valid shape. This also makes NOTIF-1 moot.

### 15. HOOK-1 — ✅REAL (worse than first stated) — see SHADOWBAN-1
Pulse-card report → `user_reports` → inert. **Elite fix:** route through `reportStore.submitReport` → `submit_report` RPC → `reports` (reaches Tribunal), identical to `ReportSheet`; retire `user_reports`/trust_score per SHADOWBAN-1 decision.

### 16. TYPES-4 — ✅REAL (line-proven)
Stale `react-native-purchases.d.ts` stub types the SDK as `unknown`; `Purchases: any` → payments layer uncompiled.
**Elite fix:** delete the stub; `let Purchases: typeof import('react-native-purchases').default | null`; type `parseEntitlements`'s `customerInfo` via the SDK's `CustomerInfo`.

---

# WAVE 3 — LOW severity (verified during layer audit; cited in findings/*)

> All confirmed real with `file:line`; low blast radius. Batch by theme.

- **17. BACKEND-LOUNGE-1** — invite-code SELECT policy gates on "has code" not "matches code" → private-lounge metadata enumerable by any archivist+. Fix: SECURITY DEFINER `find_lounge_by_invite(p_code)` returning only the matching row; drop the broad policy.
- **18. BACKEND-RL-1** — `rate_limit_check` SECURITY DEFINER, dynamic EXECUTE on unqualified identifiers, no `SET search_path`. Fix: add `SET search_path=public` + schema-qualify.
- **19. BACKEND-EMAIL-1/2** — `send-email` unauthenticated (spam/cost) + in-memory non-global rate-limit + unbounded Map. Fix: require service-role/shared-secret; DB-backed rate limit; TTL eviction.
- **20. BACKEND-PUSH-1** — `notify-push` trusts caller. Fix: verify DB-webhook secret header.
- **21. BACKEND-PULSE-1** — dead `social-pulse` service-role fn would leak private reviews if wired. Fix: delete (mobile uses RLS-respecting direct query).
- **22. BACKEND-TMDB-1** — open `tmdb-proxy` (quota abuse). Fix: anon-key/JWT check or per-IP throttle.
- **23. signup-collision** — `handle_new_user` email-prefix fallback lacks general-collision handling (OAuth/no-username signups can fail the unique index). Fix: suffix-dedup on collision (mirror the reserved-word path).
- **24. COMP-2** — `TrailerModal` `originWhitelist={['https://*']}`. Fix: scope to youtube/google origins.
- **25. COMP-FEED-DEAD-1** — `feed/EditorialBanner.tsx` dead. Fix: delete.
- **26. SVC-2** — `fetchOtherUserVault/Lists`, `getSocialConnections`, `FilmService.getFilmReviews` interpolate `cursorDate` raw (RLS-contained, not injectable, but inconsistent). Fix: route through the existing `parseCursor` ISO/UUID validation. (Also escape LIKE wildcards in `get_filtered_stacks_auth_cursor`.)
- **27. SVC-3 / UTIL-1/2/3/4 / OFFQ-2 / CONST-1/2/3 / LIB-3/4/5 / SCHEMA-1/2/3/4/4b / TYPES-2/3 / STORE-1/2 / HOOK-2 / FEAT-1/2** — the consistency/maintainability cluster (shared Zod enums, `z.infer` type derivation, yield-every-N in the executor, abort-vs-timeout distinction, MMKV web-logout clear, import-sanitize + zip-bomb cap, dead `_queueUserId`, etc.). Each is a small, isolated cleanup with the fix noted in `audit/findings/*` and `PLAN.md` Phases 2–3.

### 🟡 CONDITIONAL — only if the projectionist/venue (tips/showtimes/video) features ship
- **28. BACKEND-TIP-1** — `process_secure_tip` records tips with no payment verification (client-callable; author comment says should be service_role) → forgeable earnings; `book_showtime_seat` books seats free/untracked; `protect_video_review_metrics` repeats the freeze bug. Fix: payment-confirmed service-role tip path; ownership+payment on booking; trigger surgery per PROFILE-FREEZE-1.

---

# Already FIXED this engagement (verify & merge)
- **COMP-LOG-1** ✅ (runtime-proven + regression test) — log-form setters; deploy/device-verify.
- **TYPES-1** ✅ — lounge ordering; device-verify.
- **LIB-1** ✅ (7-test suite) — RC package resolution; confirm RC dashboard products exist.
- **LIB-2** ✅ — RC init observability.
- **OFFQ-1** ✅ (unit+integration) — transient-retry.
- **FOUND-1** ✅ resolved in code — deploy the founding RPC + sync-entitlement (with `REVENUECAT_SECRET_KEY`).

---

# Recommended execution order (the path to a masterpiece)
1. **WAVE 0** — live-DB verification session (resolves the ⚠️ flags). *(hours)*
2. **The testing backbone** — stand up a Supabase-branch integration test job (triggers/RLS/edge). This is the multiplier: it catches PROFILE-FREEZE-1 / NOTIF-SPOOF-1 / SHADOWBAN-1 and locks them closed forever. *(1–2 days)*
3. **WAVE 1** — the 4 HIGH backend fixes, each landed with the test that proves it. *(1–2 days)*
4. **Deploy + merge the already-fixed client P0s** (COMP-LOG-1/TYPES-1/LIB-1/LIB-2/OFFQ-1/FOUND-1) with device + dashboard verification.
5. **WAVE 2** — the MEDIUM cluster (payments consistency, privacy RPC, sanitization choke point, spoiler veil, notification de-dup/salvage). *(3–5 days)*
6. **WAVE 3** — LOW cleanups, batched by theme; decide the projectionist features' fate (do TIP-1 only if shipping). *(ongoing)*

**Definition of "masterpiece":** every WAVE 1–2 finding fixed *with a test*, the early-migration debt re-audited against live DB, the Supabase integration suite green in CI, and the client P0s deployed-verified. At that point the gap I found between "near-elite code" and "elite, launch-ready product" is fully closed.
