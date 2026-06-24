# Findings — `src/lib/*`

Read in full (source): `supabase.ts`, `revenueCat.ts`, `defensiveParse.ts`, `invariants.ts`, `queryClient.ts`, `sentry.ts`, `schemas.ts`, `scrollBridge.ts`, `pushNotifications.ts`, `tmdb.ts`. (`migrations/*.sql` deferred to infra pass; `__tests__/*` not line-audited.)

Overall: **strong-to-elite.** `tmdb.ts` (LRU+TTL cache, inflight dedup, retry/backoff, AbortController timeout, tiered search with a time budget, server-side proxy so no API key in the bundle) is exemplary. `supabase.ts`, `invariants.ts`, `defensiveParse.ts`, `pushNotifications.ts`, `sentry.ts`, `queryClient.ts` are all well-built. The real concerns are concentrated in the payments wrapper.

---

## MEDIUM

### LIB-1 (MEDIUM) — ✅ FIXED (commit 7e1753e) — `purchaseTier` matched RevenueCat packages by identifier substring; contradicts RC defaults → purchases may always fail
**RESOLUTION:** Rewrote package resolution to match on the documented store **product identifier** (`pkg.product.identifier` — `auteur_annual`, `founding_lifetime`, …) and `packageType`, via a pure exported `selectPackageForTier` with a precise→lenient match chain (canonical product id → tier+packageType → custom package id → any product for tier → legacy package-id substring as a final net). Candidates are now collected across **all** offerings (not just `offerings.current`), so resolution is agnostic to dashboard topology (single offering vs one-offering-per-tier). Added `revenueCat.selectPackage.test.ts` (7 tests) proving resolution against the standard predefined `$rc_*` layout (the broken case), founding lifetime, annual-over-monthly preference, custom-named packages, the flattened multi-tier case, the monthly fallback, and the no-match path. tsc/eslint/tests green. **Remaining caveat:** the RC dashboard must actually have these products configured — the code is now robust to identifier/topology, but a dashboard with no products at all still can't sell. Verify products exist before launch.

_Original analysis below (retained for the record):_
**Files:** `src/lib/revenueCat.ts:182-201`, `app/(modals)/membership.tsx:105,163`

`purchaseTier` resolves a package via `packages.find(p => p.identifier.toLowerCase().includes(`${tier}_annual`))`, falling back to `includes(tier)`, else `throw new Error('No package found for tier')`. The membership screen's only purchase path goes through `purchaseTier`. But RevenueCat's **package** `identifier` defaults to `$rc_monthly` / `$rc_annual` / `$rc_lifetime` — the strings `archivist_annual`, `auteur`, `founding` live on the **product** identifier (`pkg.product.identifier`), not the package identifier. Unless the RC dashboard was configured with custom package identifiers exactly matching these substrings, every purchase throws "No package found for tier."
**Why it matters:** this is the revenue path; a config/code mismatch here means no one can subscribe. Cannot be confirmed broken from code alone (depends on the RC dashboard), which is exactly why it must be verified before launch.
**Fix:** Match on `pkg.product.identifier` (and/or `pkg.packageType === ANNUAL`) rather than the package identifier, or document the required custom package identifiers and assert them. Add a dev-time log of resolved offerings so a misconfiguration is obvious.

### LIB-2 (MEDIUM) — ✅ FIXED (commit 338ca14) — RevenueCat init/config failures are invisible in production
**RESOLUTION:** Replaced the three `__DEV__`-gated `console` calls in `initRevenueCat` with `logger` (which forwards to Sentry in prod): missing key → `logger.warn('monetization disabled')`, init/configure failure → `logger.error(err)` (stack preserved), success → `logger.info`. A production init failure is now observable instead of silently no-opping every purchase/entitlement call. tsc/eslint clean. (TYPES-4 — typing the `Purchases` handle — remains open as a P2.)

_Original analysis below:_
**Files:** `src/lib/revenueCat.ts:51-71` (also `55,67,69`)

`initRevenueCat` logs only via `console.log/warn` gated on `__DEV__`. If the dynamic import or `Purchases.configure` fails in a production build, `isConfigured` stays `false`, every entitlement/purchase function silently no-ops (returns free tier / null), and **nothing is reported to Sentry**. The rest of the file correctly uses `logger.warn`/`logger.info`; init is the inconsistent outlier — and it's the one failure that disables all monetization.
**Fix:** Replace the `__DEV__` console calls in `initRevenueCat` with `logger.warn`/`captureError` so a production init failure is observable. (See also TYPES-4: type the `Purchases` handle instead of `any` so entitlement parsing is compiler-checked.)

---

## LOW

### LIB-3 (LOW) — `defensiveParse.ts` header comment contradicts the implementation
**File:** `src/lib/defensiveParse.ts:8-12` vs `:57-65`

The module header says "PROD: Graceful degradation — logs to Sentry, returns raw data." The code now **throws** in production (the inline comment at `:57-58` correctly explains why returning raw data is unsafe). The header is stale and misleading about a deliberately-changed failure mode.
**Fix:** Update the header to "PROD: captures to Sentry, then throws to trigger the ErrorBoundary."

### LIB-4 (LOW) — `ARCHITECTURE.md` documents a `src/lib/featureFlags.ts` that does not exist
**Files:** `ARCHITECTURE.md` ("Feature Flags … See src/lib/featureFlags.ts"), no matching file anywhere in `src` (grep for `featureFlag`/`feature_flag` returns nothing).
The documented "server override → role-based default → static default" feature-flag system has no implementation in the repo. Either it was removed and the doc wasn't updated, or it was never built.
**Fix:** Remove the section from ARCHITECTURE.md, or restore the implementation if it's intended.

### LIB-5 (LOW) — `schemas.ts` `TmdbIdSchema` duplicates id coercion already defined in feed/film schemas
**File:** `src/lib/schemas.ts:15` vs `src/schemas/feed.schema.ts:22,28` etc.
Same `z.union([z.string(), z.number()]).transform(Number)` pattern is redefined here. Minor; the file's own scope note acknowledges the overlap. Consider a single shared `tmdbId` coercer.

---

## Confirmed elite (no action)
- `src/lib/tmdb.ts` — resilient client; server-proxied (no key in bundle), LRU+TTL, inflight dedup, retry/backoff, 10s abort, 6s search budget across 3 tiers.
- `src/lib/supabase.ts` — SecureStore token storage, documented anon-key/RLS model, `TOKEN_REFRESH_FAILED` + invalid-session sign-out, foreground auto-refresh.
- `src/lib/invariants.ts` — boot-time env assertions with actionable message; Jest-aware.
- `src/lib/defensiveParse.ts` — unified DEV-throw / PROD-capture-and-throw strategy; array variant filters with count reporting (header comment aside).
- `src/lib/queryClient.ts` — MMKV persister with size cap (UTF-16→UTF-8 byte estimate), 24h age cap, corruption-safe restore.
- `src/lib/sentry.ts` — dev-disabled, PII-minimized (`id` only), network-noise filtering, warning channel.
- `src/lib/pushNotifications.ts` — SECURITY DEFINER RPC for token re-assignment, logout cleanup, malformed-payload guards.
