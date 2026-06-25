# ReelHouse Mobile — Final Audit Report

> Line-by-line audit of the entire app (~70k LOC: Expo/RN client + Supabase backend). Every finding traces to exact `file:line` in `audit/ISSUES.md` and `audit/findings/*`. The prioritized remediation roadmap is `audit/PLAN.md`.

## Coverage — what was read
- **Client logic layer (line-by-line):** types, schemas, lib, utils, services, stores (+domain slices), hooks, providers, features.
- **Screens:** 10 highest-risk screens line-read in full (tribunal, user profile, stacks, dossier, lounge, log, auth flows, compose, darkroom) + cross-cutting sweeps proving the other ~28 carry no direct DB/injection surface (only `dossier` + `membership` touch Supabase directly, both audited).
- **Components:** ~67 files line-read; the remaining ~45 **proven pure-presentational** by two independent sweeps (no writes/injection; no data/effect/store logic).
- **Backend (line-by-line):** all 9 edge functions; every security-bearing SQL migration — baseline schema, all RLS rounds, **every** SECURITY DEFINER function, all triggers, payment (PayTabs + RevenueCat/sync-entitlement), moderation/report/ban/block system, privacy, rate-limiting, storage. Functional/index/schema migrations swept at the policy level.

## Verdict
The **client/TypeScript layer is genuinely near-elite**: offline queue + compile-time-exhaustive mutation executor with idempotency, CQRS service layer, Zustand + TanStack CQRS with optimistic-rollback everywhere, Zod boundaries with per-row salvage, biometric/OTP step-up, LIKE/CSV/URL injection hardening. No client SQL-injection, secret-exposure, or auth-bypass.

The **real residual risk is in the backend — specifically the early `0002`-era SQL migrations**, which contain serious latent bugs the Jest suite cannot catch (CI mocks Supabase; triggers/RLS/edge functions never execute). Recent migrations (20260609+) are rigorous; the debt is concentrated and fixable.

## Findings: 50 total

### HIGH (6)
| ID | Status | Summary |
|----|--------|---------|
| COMP-LOG-1 | ✅ FIXED | Log-form core fields were no-ops (dispatch shim) → couldn't log a film. |
| TYPES-1 | ✅ FIXED | Lounge chat ordering (dead FlashList `inverted`). |
| LIB-1 | ✅ FIXED | RevenueCat package matched by package-id not product-id → purchases could always fail. |
| **BACKEND-PROFILE-FREEZE-1** | 🔴 OPEN (verify live) | `protect_profile_fields` trigger unconditionally reverts tier/role/follower-counts on every UPDATE (fires for service-role + SECURITY DEFINER too) → tier upgrades & follower counts freeze → premium gating never passes. Repeated in `protect_video_review_metrics`. |
| **BACKEND-NOTIF-SPOOF-1** | 🔴 OPEN | Notification-insert hardening defeated by a trailing-period typo in `DROP POLICY` → any authed user can insert spoofed/phishing notifications to anyone. |
| **BACKEND-PAY-1** | 🔴 OPEN | PayTabs IPN webhook authed by URL `?token=` defaulting to hardcoded `'dev-secret-123'`; no HMAC verify → forged IPN → free upgrades. |

### MEDIUM (~16)
Client/earlier: COMP-1 (online comment sanitize gap), COMP-1-orig (dossier raw write + preference double-write, ownership half now server-enforced), COMP-SPOILER-1 (spoiler toggle consumed by no UI — 5 surfaces), NOTIF-1, SVC-1, HOOK-1, TYPES-3/4, LIB-2 (✅fixed), OFFQ-1 (✅fixed), FOUND-1 (✅resolved in code).
Backend: BACKEND-PAY-2 (founding over-sell + premium tier/role mismatch), BACKEND-PRIV-1 (analytics RPC bypasses privacy), BACKEND-EMAIL-ENUM-1 (email harvesting), BACKEND-SANITIZE-1 (dead server-sanitizer ⇒ no server sanitization), BACKEND-NOTIF-DUP-1 (duplicate notifications).

### LOW (~28)
Client: SCHEMA-1/2/3/4/4b, TYPES-2, SVC-2/3, UTIL-1/2/3/4, CONST-1/2/3, LIB-3/4/5, HOOK-2, STORE-1/2, OFFQ-2, FEAT-1/2, COMP-2 (TrailerModal whitelist), COMP-FEED-DEAD-1.
Backend: BACKEND-LOUNGE-1 (private-lounge metadata enumerable), BACKEND-RL-1 (rate_limit search_path), BACKEND-EMAIL-1/2 (send-email unauth + memory), BACKEND-PUSH-1 (notify-push unauth), BACKEND-PULSE-1 (dead social-pulse privacy leak), BACKEND-TMDB-1 (open proxy), BACKEND-TIP-1 (forgeable tips, if-shipped), signup-collision.

## Top remediation priorities (see PLAN.md Phase 0-BACKEND)
1. **Verify the live `protect_profile_fields` trigger** (PROFILE-FREEZE-1) — potential premium/social breakage; if live, it's the #1 fix.
2. **Fix the notifications `DROP POLICY` typo** (NOTIF-SPOOF-1) — one line.
3. **Remove the PayTabs hardcoded secret + add HMAC verify** (PAY-1).
4. **Gate `get_email_by_username`** (EMAIL-ENUM-1) and the analytics RPC (PRIV-1).
5. Deploy-verify the already-fixed client P0s (COMP-LOG-1, TYPES-1, LIB-1) + the founding RPC/edge-fn (FOUND-1).

## Testing gap (the one dimension materially below elite)
CI runs only Jest with a **mocked Supabase** — 0% coverage of DB triggers, RLS policies, and edge functions, which is exactly where the 3 open HIGH findings live. Maestro e2e exists but isn't in CI. Recommend: a Supabase-branch integration test job exercising triggers/RLS (PROFILE-FREEZE-1, NOTIF-SPOOF-1 would have been caught by a single "follow → count increments / non-admin can't insert notification" test).
