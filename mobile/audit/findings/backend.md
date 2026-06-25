# Findings — `supabase/` backend (IN PROGRESS)

Two supabase dirs exist: `../supabase` (parent — baseline schema, RLS rounds, lounge, rate-limiting, analytics) and `mobile/supabase` (newer — cursor pagination, founding, privacy RLS, RPC auth hardening, ban enforcement, edge fns sync-entitlement/tmdb-proxy/fetch-rss). Both are in scope.

---

## ✅ RESOLVED: SCREEN-TRIBUNAL-1 + FOUND-1 hardening — `mobile/supabase/migrations/20260622_rpc_auth_hardening.sql`
This migration is the server-side resolution of the moderation-RPC checkpoint I flagged from `tribunal.tsx`. It rewrites **5 SECURITY DEFINER functions** that previously trusted a **client-supplied id** for their authorization decision, to instead derive identity from JWT `auth.uid()`:

1. **`submit_report`** — `v_reporter_id := auth.uid()`; `p_reporter_id` retained for signature compat but **ignored**. Rate-limit (10/hr) now keyed on the real caller, so it can't be poisoned for another user. Self-report-on-profile blocked.
2. **`resolve_moderation_report_v2`** (`:101-219`) — `v_admin_id := auth.uid()`; **verifies `EXISTS(profiles WHERE id=auth.uid() AND role='admin')`** (`:126-128`); `p_admin_id` ignored. Handles warn/suspend/ban/permanent_exile/mute/dismiss + audit log (`mod_actions`) + notifications. **This is exactly SCREEN-TRIBUNAL-1 → RESOLVED.**
3. **`bulk_dismiss_reports`** (`:225-263`) — same `auth.uid()` admin gate.
4. **`get_priority_reports`** (`:269-317`) — **adds the previously-missing admin gate** (was readable by any authenticated user → report PII disclosure).
5. **`claim_founding_seat`** (`:327-332`) — `REVOKE EXECUTE FROM PUBLIC/anon/authenticated`, `GRANT TO service_role` only. Clients can no longer self-grant `is_founding` (→ founding tier → auteur-plus unlock) or burn seats. **Strengthens FOUND-1** (atomic counter from 20260620 + now unreachable by clients = fully closed server-side, pending deploy).

All 5 also add `SET search_path = public` (closes the SECURITY DEFINER search-path injection vector). All grants do `REVOKE FROM PUBLIC` then `GRANT` to the intended role (correct — PUBLIC-held privilege isn't removed by role-specific revoke). The legacy v1 resolver is dropped in `20260620_drop_legacy_resolve_moderation_report.sql`.

**Verdict:** the moderation/report/founding authorization surface is correctly hardened in code. The header comment shows these were real pre-existing vulns, now fixed. **Only caveat: must be DEPLOYED** (same operational gate as the other server-side items).

## 🔴 NEW FINDING — BACKEND-NOTIF-DUP-1 (MEDIUM): duplicate notifications on every social interaction
**Two coexisting AFTER-INSERT triggers on `public.interactions`, both inserting a notification:**
- `tr_notify_interaction` → `notify_on_interaction()` — `supabase/migrations/0002_premium_notifications.sql:41-44` (body later replaced in `20260613_02_absolute_flawless_privacy.sql:29-68`). Inserts follow/`follow_request`/endorse notifications. **Does NOT touch counts.**
- `on_interaction_created` → `handle_interaction_notification()` — `supabase/migrations/0002_rls_hardening.sql:121-124` (body later replaced in `20260613_flawless_privacy_rls.sql:109-147`). Inserts follow/`follow_request`/`endorse_log`→`reaction` notifications **AND increments `followers_count`/`following_count`.**

Each migration's `DROP TRIGGER IF EXISTS` only drops **its own** trigger name before recreating it; **neither drops the other**, and no later migration drops either. Both fire on every `INSERT INTO interactions`. Net effect per interaction:
- **follow (public):** 2 notifications — type `follow` "started following your frequency." + type `follow` "@USER is now following you." (count incremented once — OK).
- **follow_request (private, after `enforce_privacy_on_follow` downgrade):** 2 notifications — both type `follow_request`, different copy.
- **endorse_log:** 2 notifications — type `endorse` "certified your dossier 🏆" + type `reaction` "certified your log for X." (also different `type` strings — interacts with NOTIF-1's notification-shape concerns).

**Impact:** every follow / follow-request / certify spams the recipient with two notifications (and two distinct `type` values for the same event). Counts are NOT double-incremented (only `handle_interaction_notification` touches them), so this is a notification-duplication/UX bug, not a count bug. High confidence (both triggers provably present & active; both INSERT into `notifications`).
**Fix:** keep exactly one interaction-notification trigger. Recommended: **DROP `tr_notify_interaction`** (the `notify_on_interaction` path, which lacks count handling) and keep `on_interaction_created`/`handle_interaction_notification` (count-bearing) — but first reconcile the emitted `type` strings (`reaction` vs `endorse`, follow copy) with what `notificationStore`/the notifications UI renders (see NOTIF-1), so the surviving function emits the canonical types. Add a regression check that one interaction → one notification row.

**Scope confirmed:** comments are NOT affected — `log_comments`/`list_comments` each have exactly one notification trigger (`notify_on_log_comment`/`notify_on_list_comment`, only in 0002_premium_notifications). BACKEND-NOTIF-DUP-1 is specific to `interactions` (follow/follow_request/endorse).

## 🔴 NEW FINDING — BACKEND-PAY-1 (HIGH): PayTabs webhook auth = URL shared-token with a hardcoded default
**File:** `supabase/functions/paytabs-handler/index.ts:7,92,125-129`
- `const WEBHOOK_SECRET = Deno.env.get('PAYTABS_WEBHOOK_SECRET') || 'dev-secret-123'` (`:7`). The IPN listener authenticates purely by `url.searchParams.get('token') !== WEBHOOK_SECRET` (`:125-129`), and the callback URL embeds the secret as a query param (`:92`).
- **Risk A (catastrophic, misconfig-gated):** if `PAYTABS_WEBHOOK_SECRET` is unset in prod, the secret falls back to the **publicly-known literal `'dev-secret-123'`** → anyone can POST a forged IPN with `response_status:'A'` and `cart_id:"MEMBERSHIP|<victim_or_self>|founding"` and the handler upgrades that user's `role`/`is_founding` via the service-role client (`:140-156`) — **free tier upgrades / arbitrary role grants**.
- **Risk B (always):** a secret in a URL query string is logged by proxies, PayTabs, and Supabase edge logs → token leakage re-enables forgery. PayTabs supports an HMAC IPN `signature` header; the handler does **not** verify it.
- The `/create` route is correctly JWT-gated (`:33-55`) and `cart_id` is server-built (`:76`) — so the create side is fine; the webhook side is the hole.
**Fix:** (1) remove the `'dev-secret-123'` fallback — fail closed if the env var is missing; (2) verify PayTabs's HMAC `signature` over the raw request body instead of (or in addition to) the URL token; (3) add IPN idempotency keyed on the PayTabs `tran_ref` to prevent replay.

## 🔴 NEW FINDING — BACKEND-PAY-2 (MEDIUM): PayTabs founding path bypasses the atomic seat counter
**File:** `supabase/functions/paytabs-handler/index.ts:151-156`
For `tier === 'founding'` the handler writes `updatePayload.is_founding = true` and `supabaseAdmin.from('profiles').update(...)` **directly**, NOT via the row-locked `claim_founding_seat` RPC. So the **web/PayTabs founding purchases can exceed the 100-seat cap** (concurrent buyers all pass) — FOUND-1's server-side fix only protects the RevenueCat→`sync-entitlement` path. Two payment paths, only one enforces the cap.
**Fix:** route the PayTabs founding grant through `claim_founding_seat(userId)` too (and honor its boolean result — grant auteur but not `is_founding` when the cap is hit), mirroring `sync-entitlement`.

## Edge functions — read

### tmdb-proxy (`supabase/functions/tmdb-proxy/index.ts`) — mostly clean
Key-hiding passthrough to api.themoviedb.org. No SSRF (host fixed to `TMDB_BASE`; `pathPart` is path-only and can't override host via `new URL(base+path)`); `api_key` appended server-side (never exposed); 5-min in-memory cache w/ FIFO eviction (bounded 500).
- **BACKEND-TMDB-1 (LOW):** endpoint is unauthenticated with no rate-limit → an open proxy that can be abused to burn the TMDB API key's quota/rate-limit. Data is public and the key stays hidden, so impact is quota/cost only. Consider a lightweight auth/anon-key check or per-IP throttle.

### send-email (`supabase/functions/send-email/index.ts`) — LOW issues
Recipient is always the user's **own** email (`auth.admin.getUserById(userId)`), so no arbitrary-recipient/open-relay or exfiltration. `username` is interpolated into HTML unescaped (`:139,154`) but **safe** because usernames are charset-restricted (validateUsername blocks `<>`).
- **BACKEND-EMAIL-1 (LOW):** **no auth gate** — any caller can POST `{type,userId}` and trigger a welcome/digest email to any user. Bounded (emails go to that user, 2 types) but enables targeted spam + Resend cost/quota abuse. The rate-limit (`:20,35-38`) is **in-memory per edge instance**, not global (Deno Deploy runs many instances → 1/day not actually enforced). Fix: require service-role/JWT (or a shared secret) since welcome/digest are meant to be triggered by signup hook/cron; make the rate-limit DB-backed.
- **BACKEND-EMAIL-2 (LOW):** `rateLimitCache` Map never evicts stale date-stamped keys → unbounded memory growth on a long-lived worker. Add TTL/size eviction (as tmdb-proxy does).

### notify-push (`supabase/functions/notify-push/index.ts`) — LOW (systemic pattern)
DB-webhook target (AFTER INSERT on `notifications` → web-push to `record.user_id`'s subscriptions, service-role). Expired-sub cleanup (410/404→delete) is good; push content is hardcoded per `record.type` (no injectable content).
- **BACKEND-PUSH-1 (LOW):** **no caller verification** — accepts any POST with `{record:{user_id,type}}`, so an attacker can forge a payload and spam any user with canned push notifications. Same systemic gap as send-email. Fix: verify the Supabase DB-webhook secret header (or restrict to service-role).
- **Systemic note:** internal/webhook edge fns (`notify-push`, `send-email`) trust the caller. Add a shared-secret/JWT check to all webhook-triggered functions.

### sanitize-input (`supabase/functions/sanitize-input/index.ts`) — DEAD + reinforces COMP-1
- **BACKEND-SANITIZE-1 (MEDIUM, reinforces COMP-1):** this edge fn's header claims it "enforces input sanitization on the server to prevent client-side bypass" — but a full-repo grep shows it is **invoked by nothing** (client or backend). The advertised server-side enforcement **does not exist**; sanitization is purely the client `sanitizeInput` util, applied inconsistently (offline mutationExecutor yes, online services no — COMP-1). So there is NO server-side sanitization choke point at all. Fix path ties to COMP-1: either enforce in the service layer AND wire real server enforcement (DB triggers/CHECK or actually call this from the write RPCs), or delete this dead function so it doesn't imply false coverage.
- **Latent LOW:** the profanity regexes false-positive on innocent words — `\bn+i+g+` matches `night_owl`, `nightmare` (verified) → legit usernames would be rejected. Moot while the function is dead, but fix if it's ever wired.

### news-proxy — clean
Fixed feed URLs (no user input → no SSRF), 5s per-feed timeout, HTML-stripped descriptions, 10-min cache, feed `link` navigation is scheme-allowlisted client-side (linking.ts). No findings.

### social-pulse — LATENT (dead) privacy leak
- **BACKEND-PULSE-1 (LOW, latent):** uses the **service-role key** to fetch recent logs and serve them to any unauthenticated caller (CORS `*`) — this **bypasses the `can_view_user_data` RLS**, so private users' reviews would appear in a public feed. Currently **unwired/dead** (mobile `SocialPulse.tsx` queries logs via the anon client, RLS-respected). Fix: delete the dead fn, or if intended for use, query with the anon client / add an explicit `is_social_private=false` filter.

### fetch-rss (`mobile/supabase/functions/fetch-rss/index.ts`) — mostly clean
Proxies a user-supplied `url` through **rss2json.com** (fetches `api.rss2json.com?rss_url=...`, NOT the URL directly) → no internal-network SSRF from this function; 8s timeout; graceful empty-items degradation. Minor (LOW): allows `http://` and is an unauthenticated open proxy to rss2json (abuse/cost only).

### sync-entitlement — clean (re-confirmed)
Verifies entitlement S2S with RevenueCat, calls `claim_founding_seat` for founding (atomic), writes role via service-role. Correct (see FOUND-1 resolution).

## Edge functions — SUMMARY
9 functions read. Real findings: **PAY-1 (HIGH)**, PAY-2/SANITIZE-1 (MEDIUM), TMDB-1/EMAIL-1/EMAIL-2/PUSH-1/PULSE-1 (LOW). Clean: news-proxy, fetch-rss, sync-entitlement, tmdb-proxy(core). **Systemic theme:** several edge fns are unauthenticated and/or dead (sanitize-input, social-pulse dead; send-email, notify-push, tmdb-proxy, fetch-rss open) — webhook/internal fns should verify a shared secret; dead fns (sanitize-input, social-pulse) should be deleted so they don't imply coverage that doesn't exist.

## 🔴 NEW FINDING — BACKEND-PRIV-1 (MEDIUM): analytics RPC bypasses the privacy gate
**File:** `mobile/supabase/migrations/20260609_security_definer_hardening.sql:187-240` (`get_public_profile_analytics`; orig `20260601_public_profile_analytics_rpc.sql`). Caller: `src/services/ProfileDataService.ts:235`.
The SECURITY DEFINER function only checks `auth.uid() IS NULL` — it does **not** call `can_view_user_data(p_user_id)`. So any authenticated user can invoke it directly for a **private** target and receive that user's aggregate analytics: `total_logs`, `pre_1960_count`, `perfect_ratings_count`, `has_physical_media`, `has_abandoned`, `decades_logged_count`, `has_rewatched`, `avg_rating`, top decades, and autopsy averages. These are derived from `logs` rows that the `can_view_user_data` RLS (20260613) otherwise protects from non-followers → **the analytics RPC re-exposes privacy-gated data in aggregate**, bypassing the privacy model. Directly callable (granted to authenticated); client UI gating doesn't matter.
**Fix:** gate the function body on `can_view_user_data(p_user_id)` (owner/public/approved-follower) — return `{"error":"forbidden"}` / empty otherwise, mirroring the logs RLS. (Same `STABLE`/`SET search_path` hardening the sibling functions already have should be applied too — this one is plain `SECURITY DEFINER` `LANGUAGE sql` without `SET search_path`.)

## Other migrations — confirmed elite (no findings)
- **20260621_ban_enforcement_rls.sql** — RESTRICTIVE `is_user_not_banned()` WITH CHECK on INSERT across all 10 user-content tables (+ UPDATE on logs/dossiers) = unforgeable server-side ban enforcement backing the client `useBanCheck`. DELETE intentionally allowed. `SET search_path` set; idempotent.
- **20260609_security_definer_hardening.sql** — create_lounge_with_member / replace_list_items (with ownership check) / get_user_lounges all derive identity from `auth.uid()`; elite CTE in get_user_lounges. (Analytics fn is the exception — BACKEND-PRIV-1.)
- **20260625_dossier_comments_ownership_rls.sql** — full RLS on dossier_comments: DELETE owner-or-admin, UPDATE owner-only, INSERT `WITH CHECK (user_id=auth.uid())` (so the raw insert in dossier/[id].tsx can't forge another user's comment). **Server-enforces the ownership half of COMP-1-orig** (only its sanitization inconsistency remains).
- **20260620_feed_block_filtering.sql** — `get_community_feed_auth_cursor` / `get_following_feed_auth_cursor` / `get_filtered_stacks_auth_cursor` add `NOT is_hidden_by(auth.uid(), author)` filtering at the query level (fixes a real pagination-truncation bug) + stable `(created_at,id)` tuple cursors. Crucially **NOT SECURITY DEFINER** → the `can_view_user_data` logs-RLS still applies, so private users don't leak into feeds. Minor (ties to SVC-2): `get_filtered_stacks_auth_cursor` ILIKEs `'%'||p_search||'%'` without escaping LIKE wildcards (parameterized → no SQLi, just `%`/`_` wildcard semantics).

## Still to verify
- Private-profile RLS ✅ (done — `can_view_user_data` + `enforce_privacy_on_follow`; resolves the profile-privacy checkpoint).
- `ban_enforcement_rls`, `dossier_comments_ownership_rls`, `security_definer_hardening`, `feed_block_filtering`, `following_feed_auth`, baseline schema, rate_limiting.
- Edge functions: paytabs-handler, send-email, tmdb-proxy, news-proxy/fetch-rss, notify-push, social-pulse, sanitize-input, sync-entitlement.
- Private-profile RLS (`20260613_flawless_privacy_rls.sql`, `20260613_02_absolute_flawless_privacy.sql`) — resolves the user-profile privacy checkpoint.
- `ban_enforcement_rls`, `dossier_comments_ownership_rls`, `security_definer_hardening`, `feed_block_filtering`, `following_feed_auth`.
- Edge functions: paytabs-handler, send-email, tmdb-proxy, news-proxy/fetch-rss, notify-push, social-pulse, sanitize-input, sync-entitlement.
- Baseline schema + RLS rounds; rate_limiting; the RPCs the client depends on (get_community_feed_auth_cursor, get_profile_counts, update_my_preferences, etc.).
