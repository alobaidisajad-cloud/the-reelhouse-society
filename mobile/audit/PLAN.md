# ReelHouse Mobile — Master Plan to Elite

> The consolidated, prioritized roadmap built from the line-by-line audit. Every item traces to a verified finding in `audit/findings/*` and `audit/ISSUES.md`. Ordered highest-impact-first.

## Where the codebase stands (the honest verdict)
The **entire non-UI logic layer is audited line-by-line (159 files, ~40k LOC): types, schemas, lib, utils, services, stores, hooks, providers, features, plus the highest-risk components/screens.** The remaining ~190 UI files were swept at the pattern level (injection, direct DB writes, WebView, dead FlashList props) and partially read.

**This is already a near-elite codebase.** The resilience engine (offline queue + mutation executor), the CQRS service layer, the Zustand state layer, and the hook layer are genuinely top-tier — optimistic-update-with-rollback everywhere, compile-time-exhaustive offline mutations with idempotency guards, Zod boundaries with per-row salvage, cross-user-bleed guards, biometric+OTP step-up auth, injection hardening (LIKE/CSV/URL). The gap to "truly elite" is **narrow and concentrated**, not systemic. No SQL-injection, secret-exposure, or auth-bypass defects were found.

Baseline: `tsc` clean (strict), `eslint` 0 errors / 18 warnings, test coverage ~19% lines.

---

## PHASE 0 — Ship-blockers (do before live testing / launch)

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
