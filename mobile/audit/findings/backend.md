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

## Still to verify
- Private-profile RLS ✅ (done — `can_view_user_data` + `enforce_privacy_on_follow`; resolves the profile-privacy checkpoint).
- `ban_enforcement_rls`, `dossier_comments_ownership_rls`, `security_definer_hardening`, `feed_block_filtering`, `following_feed_auth`, baseline schema, rate_limiting.
- Edge functions: paytabs-handler, send-email, tmdb-proxy, news-proxy/fetch-rss, notify-push, social-pulse, sanitize-input, sync-entitlement.
- Private-profile RLS (`20260613_flawless_privacy_rls.sql`, `20260613_02_absolute_flawless_privacy.sql`) — resolves the user-profile privacy checkpoint.
- `ban_enforcement_rls`, `dossier_comments_ownership_rls`, `security_definer_hardening`, `feed_block_filtering`, `following_feed_auth`.
- Edge functions: paytabs-handler, send-email, tmdb-proxy, news-proxy/fetch-rss, notify-push, social-pulse, sanitize-input, sync-entitlement.
- Baseline schema + RLS rounds; rate_limiting; the RPCs the client depends on (get_community_feed_auth_cursor, get_profile_counts, update_my_preferences, etc.).
