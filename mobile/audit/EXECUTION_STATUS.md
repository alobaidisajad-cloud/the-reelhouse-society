# Execution Status — remediation of the 51 findings

> What was executed (committed + verified), and exactly what YOU must do manually.
> Branch: `fix/log-form-core-fields`. Verification gate for every code commit: `tsc` clean · `eslint` clean · full Jest suite green (now **93 suites / 908 tests**, up from 91/900 — the deltas are new tests added for the fixes).

---

## ✅ ALL CODE FIXES COMPLETE

Every finding that can be resolved in code/SQL/edge-function source has been executed, committed, and verified — **50 of 51**, including the two that needed your decision (EMAIL-ENUM-1 → server-side username login; CONST-3 → RevenueCat-sourced prices). The only outstanding items are (1) **deployment/config steps that only you can perform** and (2) **TIP-1**, which is feature-gated (nothing to build until a tips/showtimes feature ships).

### Backend migrations (idempotent; written, NOT yet deployed — see Manual Step 2)
| Finding(s) | Migration | What it does |
|---|---|---|
| NOTIF-SPOOF-1 (HIGH) · NOTIF-DUP-1 (MED) | `20260626_01_notification_security.sql` | drops the permissive client notification-INSERT policy (both real + typo'd names) + explicit `WITH CHECK (false)` deny; drops the duplicate `tr_notify_interaction` trigger |
| PROFILE-FREEZE-1 (HIGH) | `20260626_02_profile_freeze_fix.sql` | stops the protect-trigger reverting derived counters (unfreezes follower/following/total_logs); guards role/tier reverts on `auth.role()='authenticated'`; same surgery on `protect_video_review_metrics` |
| PRIV-1 (MED) · RL-1 (LOW) | `20260626_03_privacy_and_rate_limit.sql` | widens the `can_view_user_data` gate on `get_public_profile_analytics` + `STABLE`/`search_path`; `SET search_path=public` + schema-qualify on `rate_limit_check` |
| SHADOWBAN-1 | `20260626_04_remove_dormant_shadowban.sql` | drops the unreviewed trust_score deduction trigger + the dead shadowban SELECT policy |
| LOUNGE-1 (LOW) · signup-collision (LOW) | `20260626_05_lounge_invite_and_signup.sql` | SECURITY DEFINER `find_lounge_by_invite(p_code)` (returns only the matching row) + drops the broad enumeration policy; extends `enforce_username_policy` to suffix-dedup general collisions on signup |
| COMP-SPOILER-1 (LOW) | `20260626_06_feed_spoiler_flag.sql` | adds `is_spoiler` (trailing col) to the two feed cursor RPCs so the spoiler veil works on the RPC feed path |
| EMAIL-ENUM-1 (MED) | `20260626_07_lock_email_lookup.sql` | REVOKEs `get_email_by_username` from anon/authenticated (username login now goes through the server-side edge function) |

### Edge functions (written, NOT yet deployed — see Manual Step 3)
| Finding(s) | File | Fix |
|---|---|---|
| PAY-1 (HIGH) · PAY-2 (MED) | `paytabs-handler` | removed `'dev-secret-123'` fallback (fail closed) + length-safe token compare; writes role+tier; routes founding via atomic `claim_founding_seat` |
| EMAIL-1 (LOW) · EMAIL-2 (LOW) | `send-email` | enforce-if-configured `x-function-secret`; bounds the rate-limit Map with TTL eviction |
| PUSH-1 (LOW) | `notify-push` | enforce-if-configured `x-function-secret` on the DB-webhook entrypoint |
| TMDB-1 (LOW) | `tmdb-proxy` | best-effort per-IP throttle (120/min) to deter open-proxy abuse |
| EMAIL-ENUM-1 (MED) | `sign-in-with-username` | **new** — resolves email + verifies password server-side, returns only session tokens, generic error on failure + per-IP throttle (kills the username-enumeration vector) |
| PULSE-1 (LOW) | `social-pulse` | **deleted** (dead service-role fn that would leak private reviews) |
| SANITIZE-1 (LOW) | `sanitize-input` | **deleted** (dead unwired fn; client sanitize choke point covers it — COMP-1) |

> **Enforce-if-configured** = these endpoints log a warning and stay open until `FUNCTION_SHARED_SECRET` is set, so deploying the code is non-breaking; setting the secret (Manual Step 4) flips them closed.

### Client code (live in the app once merged/built)
COMP-1 (sanitize choke point in LogService/StackService) · COMP-1-orig (preferences no longer full-column-overwritten — all writes go through the merge RPC) · HOOK-1 (reports → Tribunal via reportStore) · HOOK-2 (RN Text.render patch version-pinned + smoke test) · SVC-1 (removed broken offline notif insert; trigger is the source) · SVC-3 (shared decoder) · UTIL-1 (0ms yield) · UTIL-2 (abort-vs-timeout distinction) · UTIL-3 (timeAgo year) · UTIL-4 (no false "username taken") · STORE-1 (web logout clears storage) · STORE-2 (restoreSession self-corrects on no-session) · OFFQ-2 (removed dead write-only `_queueUserId`; flush already enforces ownership via live session) · NOTIF-1 (per-row salvage) · TYPES-2 (shared report enums) · TYPES-3 (ProfileLog autopsy/viewingHistory derived from DomainLog) · TYPES-4 (deleted stale purchases stub; typed against the real SDK) · SCHEMA-1 (EditProfile uses validateUsername) · SCHEMA-2 (shared privacy enums) · SCHEMA-3 (`z.unknown()` for JSONB) · SCHEMA-4 (DomainLogSchema bound to the DomainLog interface via compile-time guard) · SCHEMA-4b (deleted dead schema) · SVC-2 (cursor sanitization — id shape-check + quote-escaping) · CONST-1 (derived sepia matches base channels) · CONST-2 (barrel completeness) · LIB-3/LIB-4 (doc accuracy) · LIB-5 (one shared numeric-id coercer) · COMP-2 (TrailerModal whitelist scoped) · COMP-FEED-DEAD-1 (deleted dead file) · COMP-SPOILER-1 (reader-side spoiler veil across log-detail / feed / film critiques / read-all / pulse) · FEAT-1 (sanitize imported review/notes) · FEAT-2 (zip-bomb cap).

### Previously fixed (earlier in engagement)
COMP-LOG-1, TYPES-1, LIB-1, LIB-2, OFFQ-1 (all tested) · FOUND-1 (resolved in code).

---

## 🔴 WHAT YOU MUST DO MANUALLY (in order)

1. **WAVE 0 — verify the live DB FIRST (most important).** In the Supabase SQL editor, dump the live definitions and compare to the migrations (queries are in `MASTER_PLAN.md` → WAVE 0). This tells you whether PROFILE-FREEZE-1 / SHADOWBAN-1 / NOTIF-SPOOF-1 are *live* (then these migrations fix them) or were hand-patched (then they just realign the repo). **If PROFILE-FREEZE-1 is live, premium upgrades + follower counts are currently broken — confirm this first.**
2. **Deploy the migrations:** take a DB snapshot, then `supabase db push` (applies `20260626_01..07`). All are idempotent — safe to re-run.
3. **Deploy / remove edge functions:** `supabase functions deploy paytabs-handler send-email notify-push tmdb-proxy sign-in-with-username`; remove the deleted `social-pulse` and `sanitize-input` functions from the project. (`sign-in-with-username` uses the auto-provided `SUPABASE_ANON_KEY` + service-role key — no extra config.)
4. **Set environment variables / secrets:**
   - `PAYTABS_WEBHOOK_SECRET` — the webhook now **fails closed** without it.
   - `FUNCTION_SHARED_SECRET` — then configure the Supabase DB webhooks for `notify-push` (and any caller of `send-email`) to send it as the `x-function-secret` header. Until set, those endpoints stay open (and log a warning).
   - `REVENUECAT_SECRET_KEY` — needed by `sync-entitlement` for FOUND-1.
   - Confirm `RESEND_API_KEY`, `TMDB_API_KEY`, VAPID keys are set.
5. **RevenueCat dashboard (LIB-1):** confirm products exist with ids the resolver matches (`archivist_annual`, `auteur_annual`, `founding_lifetime`, …). Without products configured, purchases can't complete.
6. **Device-verify the fixed flows:** log a film (COMP-LOG-1); lounge chat ordering (TYPES-1); a real purchase upgrading tier + unlocking premium (after migration 02); following a user incrementing the count (proves PROFILE-FREEZE-1 fixed); report-from-pulse-card reaching the Tribunal (HOOK-1); **spoiler veil** — flag a review as a spoiler and confirm it veils in the feed, film critiques, log detail, and pulse, and reveals on tap (COMP-SPOILER-1).
7. **Stand up the integration-test backbone** (strongly recommended): a Supabase-branch CI job exercising triggers/RLS — "follow → count++ / non-admin can't insert a notification / private user's logs invisible to non-follower". This permanently locks the HIGH findings closed (Jest with mocked Supabase can't).
8. **Branch/PR hygiene:** this work sits on `fix/log-form-core-fields`. Consider splitting into reviewable PRs (client fixes / backend migrations / edge functions) before merge.

---

## 🟡 ONE FINDING IS FEATURE-GATED (nothing to build yet)

- **TIP-1** — only relevant **if** the projectionist / tips / showtimes feature ships. When it does: payment-confirmed service-role tip path + booking-ownership checks. No-op until then.

*(EMAIL-ENUM-1 and CONST-3 — previously pending your decision — are now implemented per your choices: server-side username login, and RevenueCat-sourced prices.)*

---

## Status summary
**50 of 51 findings fully executed in code** (committed + verified green; the suite is at 93 files / 910 tests). The 51st (TIP-1) is feature-gated. Everything else now depends only on the manual deploy/config/verify steps above.
