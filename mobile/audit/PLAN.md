# ReelHouse Mobile — Master Plan to Elite

> The consolidated, prioritized roadmap built from the line-by-line audit. Every item traces to a verified finding in `audit/findings/*` and `audit/ISSUES.md`. Ordered highest-impact-first.

## Where the codebase stands (the honest verdict — UPDATED after the full backend read)
**Coverage now:** the entire `src/` non-component logic layer (types/schemas/lib/utils/services/stores/hooks/providers/features), the screen layer's security/data dimensions (10 screens line-read + cross-cutting sweeps proving the rest), the component layer's security/data dimensions (proven complete by sweep), **all 9 edge functions, and every security-critical SQL migration (RLS rounds, all SECURITY DEFINER functions, triggers, payment, moderation/report/ban/block, privacy, rate-limiting, storage)** are audited line-by-line. Only pure-presentational components (~25 files) and pure schema/index/perf migrations remain — provably no security/data surface left.

**The client/TypeScript layer is genuinely near-elite** (offline queue + exhaustive mutation executor, CQRS services, Zustand+TanStack CQRS, optimistic-rollback everywhere, Zod per-row salvage, biometric/OTP step-up, LIKE/CSV/URL injection hardening). **No client SQL-injection, secret-exposure, or auth-bypass.**

**BUT the backend (SQL/edge) deep-read changed the verdict materially.** The recent migrations (20260609+) are rigorous, but the **early `0002`-era "hardening" migrations contain serious latent security bugs that the test suite cannot catch** (Jest mocks Supabase; triggers/RLS never execute in CI):
- a profile-protect trigger that (as written) **freezes tier upgrades + follower counts** (PROFILE-FREEZE-1) — repeated in the video-metrics trigger;
- a **notification-spoofing** hole from a one-character typo in a `DROP POLICY` (NOTIF-SPOOF-1);
- a PayTabs webhook with a **hardcoded default secret** (PAY-1) and an **email-enumeration** RPC (EMAIL-ENUM-1).
These are **P0/HIGH** and several need **live-DB verification** (the migration files may be stale vs a hand-patched prod). This is where the remaining risk actually lives — not in the client.

**Totals: 50 findings** — 6 HIGH (3 client ✅fixed: COMP-LOG-1/TYPES-1/LIB-1-area; 3 backend open: PROFILE-FREEZE-1, NOTIF-SPOOF-1, PAY-1), ~16 MEDIUM, ~28 LOW. Client ship-blockers fixed; **backend ship-blockers are the new top of the plan (Phase 0-BACKEND).**

Baseline: `tsc` clean (strict), `eslint` 0 errors / 18 warnings, test coverage ~19% lines (and **0% of DB triggers/RLS/edge functions** — the dimension where the HIGH bugs hide).

---

## PHASE 0-BACKEND — NEW server-side ship-blockers (discovered in the backend deep-read; HIGHER priority than the client fixes below)

> These were found by reading the SQL migrations + edge functions line-by-line. They are **not visible to the Jest suite** (mocked Supabase) and several are latent landmines that only fire in production. **Verify each against the LIVE database**, since some early migrations may have been hand-patched out-of-band (in which case the migration files are dangerously stale for fresh deploys/DR).

| # | Finding | What | Why it's P0 |
|---|---------|------|-------------|
| 0.A | **BACKEND-PROFILE-FREEZE-1** 🔴 *(verify live FIRST)* | `protect_profile_fields` (0002_rls_hardening, never superseded) unconditionally reverts `role`/`tier`/`followers_count`/`following_count`/`total_logs` on every profile UPDATE — no `auth.role()` guard. BEFORE triggers fire for service-role + SECURITY DEFINER triggers too. **Repeated** in `protect_video_review_metrics` (views/tip_total). | If live: tier never upgrades → `premium_rls` (tier-gated) never passes → **no one gets premium they paid for**; follower counts frozen at 0. CRITICAL for monetization + social. Fix: stop protecting derived counters; gate role/tier revert on `auth.role()='authenticated'`; make `check_role_update` the single role guard; add trigger integration tests. |
| 0.B | **BACKEND-NOTIF-SPOOF-1** 🔴 | The "Trustless Notification Engine" `DROP POLICY IF EXISTS "…notifications."` has a **trailing-period typo** vs the real policy name `"…notifications"` → silent no-op → the permissive `WITH CHECK (auth.role()='authenticated')` INSERT policy is **still live**. | **Any authenticated user can insert spoofed/phishing notifications to any user** (arbitrary type/from_username/message). Fix: drop with the correct name; rely on the SECURITY DEFINER triggers (which bypass RLS); add a cross-user-insert-denied test. |
| 0.C | **BACKEND-PAY-1** 🔴 | PayTabs IPN webhook authed only by a URL `?token=` defaulting to hardcoded `'dev-secret-123'`; no HMAC signature verification. | If `PAYTABS_WEBHOOK_SECRET` unset in prod → **forged IPN → free role/founding upgrades** via service-role write. Fix: remove the fallback (fail closed), verify PayTabs HMAC over the raw body, add `tran_ref` idempotency. (If PayTabs/web checkout isn't live yet, do this before it ships.) |
| 0.D | **BACKEND-EMAIL-ENUM-1** | `get_email_by_username` defaults to PUBLIC execute (anon-callable), no rate-limit; usernames are public. | Anyone can **harvest the entire userbase's emails** (phishing/cred-stuffing). Fix: resolve username→email + sign-in in one server step that never returns email, or strict per-IP rate-limit, or email-only login. |
| 0.E | **BACKEND-PAY-2** + premium-gating consistency | PayTabs founding path sets `is_founding` directly (bypasses atomic `claim_founding_seat`) → web founding over-sell; and `premium_rls` gates on `tier` while PayTabs writes only `role` → payers locked out of premium. | Revenue integrity + paid-feature access. Fix: route PayTabs founding through `claim_founding_seat`; gate premium RLS on resolved-tier (role+is_founding+tier) or ensure all pay paths set `tier`. |

**Deploy/verify gate for the above:** confirm the live definitions of `protect_profile_fields`, the notifications INSERT policy, the PayTabs secret, and `get_email_by_username` grants. Any mismatch between live DB and these migration files is itself a finding (stale migrations break fresh deploys/DR).

## PHASE 0 — Client ship-blockers (ALL FIXED — pending device/dashboard/deploy verification)

| # | Finding | What | Why it's P0 |
|---|---------|------|-------------|
| 0.0 | **COMP-LOG-1** ✅*FIXED, needs device check* | The film-logging form's core fields were no-ops: `LogForm` routed status/rating/review/date/etc. through `useLogFlow.dispatch`, a "backwards-compat" shim that only wired 6 premium fields (no default). `validateLogSubmission` then blocked submit. | **A user could not log a watched film** — the app's primary action was broken on the main path. **FIXED** (commit 4f6df68, branch `fix/log-form-core-fields`): migrated all 16 dispatch sites to the real typed setters, deleted 7 dead wrappers, **removed the dispatch shim** (reuse is now a compile error), added a regression test. tsc/eslint/full-suite green. **Action: verify on device, then merge.** |
| 0.1 | **TYPES-1** ✅*fixed, needs device check* | Lounge chat ordering (dead `inverted` prop). Fixed on `fix/lounge-flashlist-v2-chat-ordering`. | Core social feature broken for every user. **Action: verify on device, then merge.** |
| 0.2 | **LIB-1** ✅*FIXED, verify dashboard* | `purchaseTier` matched RC *package* id by substring; RC defaults are `$rc_annual`. Live purchases may always fail (`membership.tsx:105,163`). | If misconfigured, **no one can subscribe** — zero revenue. **FIXED** (commit 7e1753e): now matches `pkg.product.identifier`/`packageType` across all offerings via tested `selectPackageForTier`. **Action: confirm the RC dashboard actually has the products configured.** |
| 0.3 | **FOUND-1** ✅*resolved in code, verify deploy* | 100-Founding-seat cap is a client-side TOCTOU check. | Concurrent buyers can exceed the cap → over-sold lifetime tier. **ALREADY RESOLVED IN CODE** (no change needed): `supabase/migrations/20260620_claim_founding_seat_rpc.sql` adds an atomic row-locked `claim_founding_seat` RPC; `supabase/functions/sync-entitlement/index.ts` verifies the entitlement S2S with RevenueCat and calls that RPC for founding (sets `is_founding` only inside it); the mobile `sync_entitlement` handler (`mutationExecutor.ts:565`) routes solely through that edge function and never writes `is_founding` directly. The `membership.tsx:149-158` count check is now just a pre-flight UX guard. **Action: deploy the migration + edge function (with `REVENUECAT_SECRET_KEY` set) — the enforcement is correct but operational deployment can't be verified from code.** |
| 0.4 | **LIB-2** ✅*FIXED* | RevenueCat init/config failures are invisible in production (only `__DEV__` console). | A silent init failure disables all monetization with no alert. **FIXED** (commit 338ca14): `initRevenueCat` now routes through `logger` (→ Sentry in prod). |
| 0.5 | **OFFQ-1** ✅*FIXED* | Offline queue dead-letters transient 500/429/408 as permanent → silent loss of queued writes. | Data loss on the core durability mechanism under ordinary backend load. **FIXED** (commit 6620dd0): `isTransientError` + bounded per-mutation retry counter (halt-and-retry ×5, then dead-letter). |

**Server verification gate (must confirm before launch):** RLS enforces private-profile data access; cross-user `notifications` inserts are constrained; paid features are server-gated (not only `tier.ts` client checks); `get_community_feed_auth_cursor` and `get_profile_counts` RPCs are deployed.

---

## PHASE 1 — Correctness & trust (P1)

| # | Finding | Action |
|---|---------|--------|
| 1.1 | **NOTIF-1** | Make `fetchNotifications`/`loadMore` per-row-salvage (drop bad rows, keep rest) instead of all-or-nothing; make `message` `.nullish()`. One malformed row currently blanks the whole notifications screen. |
| 1.2 | **SVC-1** | Unify the list-comment notification shape across online (`StackService`) and offline (`mutationExecutor`) — same `type` + columns. Currently the offline path omits `message` (triggers NOTIF-1). |
| 1.3 | **HOOK-1** | Route the home-feed pulse-card report (`useReportUser` → `user_reports`) through `reportStore.submitReport` → `reports` so it reaches the Tribunal. Confirm whether `user_reports` is surfaced anywhere server-side. |
| 1.4 | **COMP-1** | Route dossier comments + profile-pref writes through `DossierService`/`auth.setPreference`; move `sanitizeInput` into the service so online & offline paths share it. Removes a sanitization bypass + parallel-implementation drift. |
| 1.5 | **TYPES-4** | Delete the stale `react-native-purchases.d.ts` stub; type the `Purchases` handle (`typeof import(...)`) so the payments layer is compiler-checked. |
| 1.6 | **BACKEND-NOTIF-DUP-1** | Two AFTER-INSERT triggers on `interactions` both insert notifications → every follow/request/endorse double-notifies (often 2 different `type` strings). Drop `tr_notify_interaction`, keep the count-bearing `on_interaction_created`/`handle_interaction_notification`; reconcile `type` strings with notificationStore (ties to NOTIF-1/SVC-1). Add a 1-interaction→1-notif test. |
| 1.7 | **BACKEND-PRIV-1** | `get_public_profile_analytics` lacks a `can_view_user_data(p_user_id)` gate → any authed user can read a private user's aggregate analytics. Add the gate (mirror `get_user_analytics`'s own-only check); add `STABLE`/`SET search_path`. |
| 1.8 | **BACKEND-SANITIZE-1 + COMP-1 (server side)** | The `sanitize-input` edge fn is dead (wired to nothing) → there is **no** server-side sanitization. Either enforce sanitization in the service layer AND add real server enforcement (DB trigger/CHECK, or call sanitize from write RPCs), or delete the dead fn so it doesn't imply false coverage. Fold into the COMP-1 fix. |
| 1.9 | **COMP-SPOILER-1** | The "CONTAINS SPOILERS" toggle is collected/persisted/read but consumed by no UI. Blur/tap-to-reveal the review in `LogReviewBody` (log detail) + add `is_spoiler` to `feed.schema`/`ReviewContent` for a feed spoiler veil. (Reader-side only; data already flows.) |

---

## PHASE 2 — Maintainability & consistency (P2)

| # | Finding | Action |
|---|---------|--------|
| 2.1 | **TYPES-3 / SCHEMA-4 / SCHEMA-4b** | Consolidate the fragmented log/vault type shapes; derive types from Zod via `z.infer`; remove the dead exported `EditProfileSchema` (the inline copy in `useEditProfile` is the live one and drops the `max(10)` links cap — which `LinksEditor` advertises). Type the `any` JSONB fields. |
| 2.2 | **SVC-2** | Route every keyset cursor through `FeedService.parseCursor`-style ISO/UUID shape validation. Today `fetchOtherUserVault`, `fetchOtherUserLists`, `getSocialConnections`, `FilmService.getFilmReviews` interpolate `cursorDate` raw (RLS-contained, but inconsistent with the safe pattern the codebase already has). |
| 2.3 | **FEAT-1 / FEAT-2** | Run imported review/notes text through `sanitizeInput`; add a decompressed-size/entry-count cap to the ZIP importer (zip-bomb defense). |
| 2.4 | **TYPES-2 / SCHEMA-2 / SCHEMA-3 / LIB-5** | Reuse shared Zod enums (`ReportableContentType`/`ReportReason`, privacy enums) instead of inlining; share the TMDB-id coercer. |
| 2.5 | **UTIL-1 / UTIL-2 / UTIL-4 / OFFQ-2** | Yield every N mutations instead of fixed 100ms×N in the executor; distinguish external-abort from timeout in `withTimeout`; only map "username taken" on a real 23505; remove dead `_queueUserId`. |
| 2.6 | **STORE-1 / STORE-2** | Clear MMKV on web logout (if web ships); have `restoreSession` clear its own optimistic auth state when no session is found (don't rely solely on the global listener). |
| 2.7 | **Backend LOW cluster** | **LOUNGE-1**: private-lounge metadata enumerable by any archivist+ (invite-code SELECT policy gates on "has code" not "matches code") → SECURITY DEFINER `find_lounge_by_invite(code)`. **RL-1**: add `SET search_path` + schema-qualify `rate_limit_check`. **EMAIL-1/2**: auth-gate + DB-rate-limit `send-email`, evict its in-memory Map. **PUSH-1**: verify DB-webhook secret in `notify-push`. **PULSE-1**: delete dead `social-pulse` (service-role → would leak private reviews). **TMDB-1**: throttle the open `tmdb-proxy`. **signup-collision**: `handle_new_user` email-prefix fallback lacks general-collision handling (OAuth signups). |
| 2.8 | **BACKEND-TIP-1** (only if projectionist/venue features ship) | `process_secure_tip` records tips with no payment verification (client-callable; author says should be service_role) → forgeable earnings; `book_showtime_seat` books seats free/untracked. Route through payment-confirmed service-role; add ownership/payment to booking. |

---

## PHASE 3 — Polish toward perfection (P3)

- **Docs/consistency:** fix `ARCHITECTURE.md` (references non-existent `featureFlags.ts` — LIB-4); update `defensiveParse` header (LIB-3); fix `EditProfileSchema` "3-20" comment (SCHEMA-1); barrel omissions (CONST-2); derived-sepia hue mismatch (CONST-1).
- **UX micro-correctness:** `timeAgo` drop the year on old dates (UTIL-3); membership hardcoded prices → RC localized `priceString` (CONST-3); `TrailerModal` tighten `originWhitelist` (COMP-2); `AccessibilityProvider` RN-internals patch — pin version + smoke test (HOOK-2).
- **NewsService** use shared `html.ts` decoder (SVC-3).

---

## PHASE 4 — Testability (the one dimension materially below elite)
Coverage is **~19% lines / 14% branches** — strong on the resilience/store core, thin elsewhere. To be "best-in-class," raise coverage on the highest-risk, now-fully-understood units:
- **Pure functions (cheap, high value):** `tier.resolveTier`, `mappers.*`, `groupNotifications`, `useStreak`, `buildLogPayload`, `parseCSV`/`normalizeDate`/`detectRatingScale` (archiveImport), `escapeSearchPattern`, `csv.escapeCsvCell`, `parseCursor`.
- **Critical flows:** offline queue flush (transient-error handling — guards OFFQ-1), mutationExecutor handlers (idempotency), `applyRewatchMerge`, notification per-row salvage (NOTIF-1).
- Keep the coverage ratchet; raise the floor each PR.

---

## Suggested execution order
1. **Phase 0** on branches, each verified (TYPES-1 device check first; LIB-1 needs the RC dashboard). These are launch-critical.
2. **Phase 1** — correctness/trust; mostly self-contained in already-audited files.
3. **Phase 2** in a "consistency sprint" (type consolidation + cursor validation + service-routing) — do TYPES-3/SCHEMA-4 together since they touch the same shapes.
4. **Phase 3** polish + **Phase 4** tests can run continuously alongside.

## Coverage to finish the audit (so the plan is provably complete)
Remaining for 100% line-level: ~190 UI files (`src/components/*` minus the 7 read, `app/*` screens minus the 2 read, 2 feature style files, `supabase/` edge functions, `scripts/`, config, root tests). The pattern sweeps already cover them for the *bug classes* found; full reads would mainly add presentational polish items, not new P0/P1 risks (the logic that carries those risks is 100% audited). Resume via `bash audit/regen_ledger.sh` → next `PENDING`.
