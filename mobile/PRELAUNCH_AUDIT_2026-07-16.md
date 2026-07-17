# FINAL PRE-LAUNCH AUDIT — The ReelHouse Society (mobile)

**Auditor:** Staff-eng sign-off pass
**Date:** 2026-07-16
**Method:** Full-chain tracing (UI → handler → logic → DB write → DB read → UI → post-refresh), not isolated reading.
**Scope of app:** ~67,400 non-test LOC across `src/` + `app/`; 14 services; ~15 stores; 54 migrations; 5 edge functions; 35 DB tables; Expo Router (38 route files).

> ## ⚠️ Coverage honesty statement (read first)
> This file records a **7-round** audit (frontend chains → backend/RLS → edge functions), done in passes exactly as requested. **Nothing is marked "verified" unless the full chain was actually traced.** All 7 rounds are **complete**; the entire security-critical backend (auth, entitlement, moderation, ban, privacy, social, content, notification/push RLS) has been traced end-to-end. **What was NOT done:** exhaustive per-screen *visual/layout* QA (Scope §5) and a few remaining pure-read services/screens' UI states — these are on-device/manual QA (see the Round 7 coverage note) and are tracked on the existing launch checklist. Every finding below is backed by a concrete file/line reference; findings needing live-DB confirmation are labelled as such.
>
> **Findings total: 1 BLOCKER · 4 HIGH · 5 MEDIUM · 8 LOW** (+ 1 systemic META-finding). **The set converged in pass 3** (systematic RLS + function-grant sweeps came back clean bar one LOW) — remaining uncertainty is live-DB drift, resolvable only by the Phase-0 queries, not more repo reading. Deep-verification passes 1–2 added F-12 through F-17. All BLOCKER/HIGH/MEDIUM fixes are **server-side only** (SQL / one edge-function env var) — **no app-code change, no new client build required** (sole exception: F-14's *cleanest* fix touches the client; a server-only alternative is given). **Key systemic issue: the repo cannot reproduce the live DB's security state** — several holes were closed live-only in prior audits and never back-ported, so multiple findings are "probably patched live but unverifiable/un-rebuildable." A **repo==live reconciliation** (run the live-state queries listed under *Could-not-fully-verify*, diff, and commit migrations) is the highest-leverage remediation.
>
> **Round 1 traced:** environment/config, TMDB proxy, Supabase client, auth store, auth-callback (PKCE/OTP/recovery), reset-password, list persistence chain, global secret/debug scan, table-name schema-consistency sample.
> **Round 2 traced:** notification store (fetch/paginate/mark/dismiss + realtime WS), notification RLS (INSERT/UPDATE/SELECT/DELETE), push-token registration lib + `register_push_token` RPC + `push_tokens` RLS, `notify-push` edge function, push-webhook trigger. **→ 2 HIGH findings (F-4, F-5) on the notification/push surface.**
> **Round 3 traced:** social-graph write paths (follow via `interactions`, block via `user_blocks`, report via `submit_report` RPC), the forge/IDOR surface, `interactions`/`user_blocks`/`reports`/`user_reports` RLS, RPC auth-hardening (`20260622`), report/moderation RPCs. **→ 1 MEDIUM drift finding (F-6); confirmed the prior "reporter-forge" is closed at the RPC layer.**
> **Round 4 traced:** content write paths (log-a-film + comments via `LogService`, dossier certify/comment, physical archive + tickets via `archiveSlice`, lounge send/react + membership via `lounge.ts`), their RLS + ban/rate gates, input sanitization, lounge realtime reconciliation, lounge-host RPC authorization. **→ 1 LOW finding (F-8); confirmed the physical_archive/list_items world-read leak is already fixed by `20260709_02`.**
> **Round 5 traced:** membership money-path — `sync-entitlement` edge fn (RevenueCat S2S trust boundary), `revenueCat.ts`, `useEntitlement`, `tier.ts` (`resolveTier`), `claim_founding_seat` RPC + 100-seat cap, and — critically — the `profiles` UPDATE RLS / column-privilege / trigger stack that governs `role`/`tier`/`is_founding`/`is_banned`. **→ 1 BLOCKER finding (F-9): client-side profile privilege escalation (free paid tiers + moderation/ban evasion).**
> **Round 6 traced:** moderation/tribunal (`ModerationService`, `resolve_moderation_report_v2` / `bulk_dismiss_reports` / `get_priority_reports` / `get_report_evidence` admin RPCs, `tribunal.tsx` guard, reports admin RLS), ban enforcement (`is_user_not_banned` + RESTRICTIVE policies), privacy internals (`can_view_user_data` 2-tier model, sealed profile, privacy migrations). **→ 1 MEDIUM drift finding (F-10): admin-role vs CHECK-constraint mismatch (interacts with F-9).**
> **Round 7 traced:** remaining read services (`FeedService` incl. cursor/search injection defense + block-filter RPCs, `FilmService`, `DossierService`, `FollowRequestService`, `NewsService`, `ProfileDataService`, `YearInCinemaService`), the `tmdb-proxy` + `fetch-rss` edge functions. **→ 1 LOW finding (F-11); feed injection defenses and privacy-gated read paths confirmed clean.** *(Pure visual/layout QA across every screen at every breakpoint was NOT performed — see coverage note; that is on-device QA.)*

---

## Part A — Coverage checklist

### Screens / routes (`app/`)
| Route | Status |
|---|---|
| `app/_layout.tsx` (boot/providers) | ⬜ NOT YET REACHED |
| `app/auth-callback.tsx` | ✅ Reviewed |
| `app/reset-password.tsx` | ✅ Reviewed |
| `app/(modals)/login.tsx` | 🟡 Partial (store side traced; UI not) |
| `app/(tabs)/index.tsx` (Lobby/home) | ⬜ NOT YET REACHED |
| `app/(tabs)/reels.tsx` | ⬜ NOT YET REACHED |
| `app/(tabs)/lounge.tsx` | ⬜ NOT YET REACHED |
| `app/(tabs)/dispatch.tsx` | ⬜ NOT YET REACHED |
| `app/(tabs)/darkroom.tsx` | ⬜ NOT YET REACHED |
| `app/(tabs)/profile.tsx` | ⬜ NOT YET REACHED |
| `app/film/[id].tsx`, `film-reviews/[id].tsx` | ⬜ NOT YET REACHED |
| `app/dossier/[id].tsx`, `dispatch/compose.tsx` | ⬜ NOT YET REACHED |
| `app/lounge/[id].tsx`, `app/lounge.tsx` | ⬜ NOT YET REACHED |
| `app/log/[id].tsx`, `app/stacks/[id].tsx` | ⬜ NOT YET REACHED |
| `app/person/[id].tsx`, `app/user/[username].tsx` | ⬜ NOT YET REACHED |
| `app/edit-profile.tsx`, `app/settings.tsx` | ⬜ NOT YET REACHED |
| `app/year-in-cinema.tsx` | ⬜ NOT YET REACHED |
| `app/(admin)/tribunal.tsx` | ✅ Reviewed (admin guard + resolve calls) |
| `app/(modals)/*` (cover-picker, list-modal, log-modal, membership, notifications-modal, search-modal, social-modal, vault-modal) | ⬜ NOT YET REACHED |
| `app/+not-found.tsx`, `app/error.tsx` | ⬜ NOT YET REACHED |

### Stores (`src/stores/`)
| Store | Status |
|---|---|
| `auth.ts` | ✅ Reviewed (full read) |
| `domain/listSlice.ts` | ✅ Reviewed (create/update/persist chain) |
| `lounge.ts` | 🟡 Partial (reactions table refs only) |
| `content.ts`, `discover.ts`, `films.ts` | ⬜ NOT YET REACHED |
| `blockStore.ts` | ✅ Reviewed (write path + RLS) |
| `reportStore.ts` + `useReportUser` | ✅ Reviewed (RPC path) |
| `domain/socialSlice.ts` (follow) | ✅ Reviewed (write path + RLS) |
| `followStore.ts`, `socialStore.ts` | 🟡 Partial (read-side pending) |
| `notificationStore.ts` (realtime) | ✅ Reviewed (full read) |
| `lounge.ts` (send/react/membership + realtime) | ✅ Reviewed (write paths + realtime reconciliation) |
| `domain/archiveSlice.ts` (physical archive + tickets) | ✅ Reviewed |
| `settings.ts`, `mmkv-storage.ts`, `resetAllStores.ts` | 🟡 Partial (referenced from logout) |
| `domain/{archiveSlice,interactionSlice,socialSlice,watchlistSlice,logSlice}.ts` | ⬜ NOT YET REACHED |

### Services (`src/services/`)
| Service | Status |
|---|---|
| `AuthService.ts` | 🟡 Partial (getSessionProfile path only) |
| `ProfileWriteService.ts` | 🟡 Partial (avatar storage path traced) |
| `LogService.ts` | ✅ Reviewed |
| `StackService.ts` | ✅ Reviewed (comment path) |
| `ProfileWriteService.ts` | ✅ Reviewed (full → F-9) |
| `ModerationService.ts` | ✅ Reviewed |
| `FeedService.ts` | ✅ Reviewed (injection defense + block filter) |
| `Film/Dossier/FollowRequest/News/ProfileData/YearInCinema` services | ✅ Reviewed (read/write paths + privacy gates) |
| `InteractionService.ts` | 🟡 Partial (follow path via socialSlice traced) |
| **`src/lib/revenueCat.ts` / `hooks/useEntitlement.ts` / `utils/tier.ts`** | ✅ Reviewed (money-path) |

### Libs (`src/lib/`)
| File | Status |
|---|---|
| `supabase.ts` | ✅ Reviewed |
| `tmdb.ts` | ✅ Reviewed |
| `logger.ts` (via `utils/`) | ✅ Reviewed |
| `pushNotifications.ts` | ✅ Reviewed |
| `revenueCat.ts`, `queryClient.ts`, `sentry.ts`, `defensiveParse.ts`, `schemas.ts`, `scrollBridge.ts` | ⬜ NOT YET REACHED |

### Backend — edge functions (`supabase/functions/`)
| Function | Status |
|---|---|
| `sign-in-with-username` | 🟡 Partial (secret handling + call site traced; full logic pending) |
| `notify-push` | ✅ Reviewed (full read → F-5) |
| `sync-entitlement` | ✅ Reviewed (full read — trust boundary CLEAN) |
| `tmdb-proxy` | ✅ Reviewed (rate-limit + path allowlist — CLEAN) |
| `fetch-rss` | ✅ Reviewed → F-11 (LOW) |

### Backend — migrations / RLS (54 files)
| Area | Status |
|---|---|
| `replace_list_items` rank_position fix | ✅ Reviewed |
| Notification security (`20260626_01`, `20260702_04`, `20260701_03`) | ✅ Reviewed → F-4 |
| Push webhook trigger (`20260626_11`) | ✅ Reviewed → F-5 |
| Lounge overhaul / reactions FK | 🟡 Partial (table existence confirmed) |
| RPC auth hardening (`20260622`: submit_report, get_priority_reports, claim_founding_seat) | ✅ Reviewed |
| `interactions` / `user_blocks` / `reports` / `user_reports` RLS | ✅ Reviewed → F-6 |
| Content RLS: `logs` (+rate limit), `dossier_*`, `physical_archive`, `tickets`, `lounge_messages`/`_reactions` | ✅ Reviewed |
| Vault/list_items privacy fix (`20260709_02`) | ✅ Reviewed (leak fixed) |
| Lounge overhaul RLS + host RPCs (`20260627_01`, `20260701_01`) | ✅ Reviewed |
| `profiles` UPDATE RLS + column privileges + freeze trigger (`20260626_02`) | ✅ Reviewed → **F-9 BLOCKER** |
| Founding seats (`claim_founding_seat`, 100-cap, `20260620`) | ✅ Reviewed |
| Moderation RPCs + reports admin RLS (`20260622`, `20260712_01`, `20260714_01`) | ✅ Reviewed → F-10 |
| Ban enforcement (`is_user_not_banned` + RESTRICTIVE policies, `20260621`) | ✅ Reviewed |
| Privacy RLS internals (`can_view_user_data` 2-tier, sealed profile; `20260626_03/08/10`, `20260709_02/05`, `20260710_01`) | ✅ Reviewed |
| Feed block filtering, analytics RPCs | ⬜ NOT YET REACHED |

### DB tables (35): analytics_events, cinema_reviews, dispatch_dossiers, dossier_certifications, dossier_comments, error_logs, founding_seat_counter, interactions, list_comments, list_items, lists, log_comments, logs, lounge_members, lounge_messages, lounges, mod_actions, notifications, physical_archive, profiles, programmes, push_subscriptions, push_tokens, reports, showtimes, tickets, tips, user_blocks, user_reports, vaults, venues, video_reviews, waitlist, warnings, watchlists
**Status:** Table-name↔client-`.from()` consistency sampled ✅; per-table RLS/column tracing ⬜ NOT YET REACHED.

---

## Part B — Per-feature findings (Round 1)

### ✅ Environment & configuration — CLEAN
Traced `.env`, `eas.json`, `app.json`, `.gitignore`, and every `EXPO_PUBLIC_*` consumer.
- Only **publishable/public** keys ship in the bundle: Supabase `sb_publishable_…` anon key (RLS-gated by design), RevenueCat `appl_…` (public SDK key), Sentry DSN (public by design). No `service_role`, `sk_live`, or private key anywhere in `src/`+`app/` (grep clean).
- `.env` is **not** git-tracked and is in `.gitignore`.
- Production `eas.json` `production` profile points at the real Supabase project (`wihyqkpoymwcvbprslyz`) and real Sentry DSN — no sandbox/dev pointers.
- Bundle id `com.reelhouse.society`, iOS buildNumber 36, `newArchEnabled: true`, PKCE-consistent `scheme: reelhouse`.

### ✅ Supabase client (`src/lib/supabase.ts`) — CLEAN
- `flowType: 'pkce'` (matches the email-link callback), `detectSessionInUrl: false`, tokens in `expo-secure-store` with `AFTER_FIRST_UNLOCK` (not MMKV/AsyncStorage).
- Handles both `TOKEN_REFRESH_FAILED` (non-public event, cast documented) and `TOKEN_REFRESHED`-with-no-access-token → local sign-out. AutoRefresh gated on `AppState === 'active'`.

### ✅ Auth store (`src/stores/auth.ts`) — CLEAN
Traced login (email + username-via-edge-fn), signup, logout, updateUser, setPreference, restoreSession.
- Optimistic writes everywhere are paired with rollback and `dirty_*` reconciliation flags (`dirty_prefs_*`, `dirty_profile_*`) so a concurrent `restoreSession` merges in-flight edits instead of clobbering them.
- `updateUser` **strips `role`** before persisting → client cannot self-elevate.
- Username login never exposes email/account existence (generic error; server-side edge fn).
- `logout()` is a thorough 10-step teardown: realtime socket, Supabase signOut, zustand reset, `resetAllStores`, RevenueCat logout, Sentry user clear, React-Query clear, push-token removal, MMKV cache purge (now on **all** platforms incl. web), module-cache clear — with partial-failure reporting to Sentry.

### ✅ Auth callback + password recovery — CLEAN (one doc nit)
- `auth-callback.tsx`: 3-tier resolve — (1) PKCE `exchangeCodeForSession`, (2) legacy OTP `verifyOtp`, (3) existing session — with typed rescue CTAs per flow (recovery / signup / email_change). Recovery routes to `/reset-password`; signup signs in on session-only data and enriches the profile in the background (won't dead-end on a slow `profiles` row).
- `reset-password.tsx`: guards on active session, enforces 5-rule password strength (parity with web), then `updateUser` → `refreshSession` → `restoreSession`, with an unmount-safe redirect timer.

### ✅ List create/update persistence (`listSlice.ts`) — CLEAN
- `updateList` uses **upsert-first, then diff-prune** (`onConflict: 'list_id,film_id'`, chunked deletes) — **no naive delete-all-then-insert window**, so a mid-write disconnect cannot wipe a list. Offline failures enqueue idempotent `update_list` mutations.
- `rank_position` is the ordering column consistently across every read/write path (client) and the server RPC.
- The `replace_list_items` RPC's historical `position`-vs-`rank_position` bug is fixed (`20260708_01`), and the fn is intentionally unused (client uses the safe direct path). **The prior memory note about a list data-loss window is stale — the current code path is safe.**

### ✅ Global secret / debug-artifact scan — CLEAN
- No `service_role`/`sk_live`/`secret_key`/`private_key` in `src/`+`app/`.
- The only raw `console.log` is inside `utils/logger.ts`, `__DEV__`-guarded; `logger.warn/error` forward to Sentry in production.
- Zero real `TODO/FIXME/HACK/XXX` in product code (4 grep hits are route-doc comments and a "border-hack" description).
- Edge functions read `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env` server-side only.

### ✅ Table-name schema consistency (sample) — CLEAN
Every client `.from('…')` table resolves: `avatars` is a **storage bucket** (not a table); `lounge_message_reactions` exists (added in `20260627_01_lounge_overhaul.sql`; the `_schema_baseline.sql` snapshot merely predates it). No orphaned table references in the sampled set.

### ⚠️ Findings

**F-1 · TMDB v3 api_key bundled in client — LOW**
`src/lib/tmdb.ts:190` — `EXPO_PUBLIC_TMDB_API_KEY` is embedded in the JS bundle and used as a **direct-to-TMDB fallback** when the `tmdb-proxy` edge function errors. Anyone can extract it from the app binary and burn the project's TMDB quota.
*Root cause:* circuit-breaker fallback was left calling TMDB directly with the raw key.
*Severity rationale:* LOW — the proxy is the primary path, TMDB keys are free/rotatable and non-sensitive, and the fallback only fires on proxy outage.
*Elite fix:* drop the direct-key fallback entirely and make the proxy the sole path (add server-side retry/circuit-breaking inside `tmdb-proxy`), or gate the fallback behind a short-lived signed token. At minimum, keep the key rotatable and monitor TMDB usage.

**F-2 · Stale doc comment on callback URL — LOW (nit)**
`app/auth-callback.tsx:19` header says `reelhouse://auth/callback` but the registered deep link is `reelhouse://auth-callback` (`Linking.createURL('auth-callback')`). Code is correct; the comment is misleading for the next maintainer.
*Fix:* update the comment to the real scheme.

**F-3 · `setPreference` rapid multi-key rollback — LOW (edge case)**
`src/stores/auth.ts:359-397` — rapid changes to *different* preference keys within the 1s debounce share one timer; on a failed server sync only the **last** key's `prevValue` is rolled back locally. Divergence is self-healing because `dirty_prefs_*` stays set and the next `restoreSession` re-pushes, so no permanent inconsistency — but the transient local state can briefly disagree with the server for non-last keys.
*Severity rationale:* LOW — self-correcting, preferences are non-critical.
*Elite fix:* accumulate a per-key `prevValue` map for the debounce window and roll back all pending keys on failure.

---

## Part B (Round 2) — Notifications & push

### ✅ Notification store (`src/stores/notificationStore.ts`) — CLEAN
Traced fetch, load-more, markRead/markAllRead/markGroupRead, dismiss/dismissGroup, realtime.
- Realtime uses a **module-scoped singleton lock** (`_realtimeCleanup`) so React StrictMode / re-mounts can't stack duplicate WS subscriptions; channel is filtered `user_id=eq.<self>`.
- Every WS payload **and** every HTTP row is `zod.safeParse`d with **per-row salvage** (drop the bad row, keep the page) — a schema-drifted column degrades gracefully instead of crashing.
- Keyset pagination uses a **compound cursor** (`created_at|id`) so notifications sharing a timestamp aren't skipped/duplicated.
- All mutations are optimistic with rollback; DELETE paths carry a defense-in-depth `.eq('user_id', self)` on top of RLS.
- Logout path purges the persisted MMKV key **and** tears down the WS (both via `registerStoreReset` and the early `teardownNotificationRealtime()` in `auth.logout()`) → no cross-user notification leak.

### ✅ Push-token registration (`pushNotifications.ts` + `register_push_token`) — CLEAN
- Token writes go through the `register_push_token` **SECURITY DEFINER** RPC, which atomically detaches a token from any prior owner before claiming it for `auth.uid()` (LIB-3). That's why `push_tokens` intentionally has no INSERT policy — and it's correct, not a gap.
- `push_tokens` RLS is SELECT-own / DELETE-own only → a user cannot read another user's device tokens. `removePushToken` DELETE is `user_id`+`platform` scoped.
- `notify-push` prunes `DeviceNotRegistered` tokens returned by Expo. Registration is guarded for physical-device-only and permission-denied.

### ⚠️ Findings (Round 2)

**F-4 · Notification INSERT RLS re-opens spoofing + push amplification — HIGH**
`supabase/migrations/20260702_04_rls_lounge_delete_notification_insert.sql:26-28`
Migration `20260626_01` deliberately closed `NOTIF-SPOOF-1` (HIGH) by making the only INSERT policy `WITH CHECK (false)` — notifications are meant to be written **only** by SECURITY DEFINER triggers. Migration `20260702_04` (6 days later) then added `CREATE POLICY "Users can send notifications from themselves" FOR INSERT WITH CHECK (from_user_id = auth.uid())` **without dropping the deny policy**. Postgres OR's permissive policies, so the effective INSERT check becomes `false OR from_user_id = auth.uid()` → **client inserts are allowed again**.
The `WITH CHECK` only constrains `from_user_id` (the sender). It does **not** constrain `user_id` (recipient), `from_username` (the *displayed* sender name — free text), `message`, or `type` (any value in the enum). So any authenticated user can:
```
POST /rest/v1/notifications
{ "user_id":"<ANY victim uuid>", "from_user_id":"<attacker's own uuid>",
  "from_username":"The ReelHouse Society", "type":"system", "message":"<phishing text>" }
```
→ the row lands in the victim's feed, displays an **impersonated sender name**, and — because of the `AFTER INSERT` push trigger (F-5 / `20260626_11`) — **fires a real push notification** to the victim's device.
*Root cause:* the migration's own note claims `from_user_id = auth.uid()` "prevents spoofing," conflating *sender-identity* forgery (blocked) with *arbitrary-recipient + display-name* spoofing (not blocked). The policy was added for a client-side stack-comment notification insert that **has since been removed** (`StackService.ts:163`, SVC-1 — the DB trigger `tr_notify_list_comment` emits it now). **No client code inserts into `notifications` anymore** (grep-confirmed), so the policy is pure liability.
*Elite fix (no app change needed — verified nothing writes notifications client-side):*
```sql
-- Restore the trigger-only invariant closed by 20260626_01.
DROP POLICY IF EXISTS "Users can send notifications from themselves" ON public.notifications;
-- Deny policy "No direct client notification inserts" (WITH CHECK false) remains as the sole INSERT policy.
-- SECURITY DEFINER triggers/RPCs bypass RLS and are unaffected.
```

**F-5 · `notify-push` endpoint likely unauthenticated (shared secret not wired) — HIGH (needs live-config verification)**
`supabase/functions/notify-push/index.ts:73-79` + `supabase/migrations/20260626_11_push_webhook.sql:26-29`
The function's caller check is **optional**: `if (FUNCTION_SECRET && header !== FUNCTION_SECRET) return 401`. If `FUNCTION_SHARED_SECRET` is unset, **every caller is accepted**. The DB webhook trigger calls the function with **only** `{"Content-Type":"application/json"}` — no `Authorization`, no `apikey`, no `x-function-secret`. For that trigger to deliver at all, the function must be deployed with **JWT verification disabled** *and* `FUNCTION_SHARED_SECRET` unset. If both hold (which they must for push to work today), the endpoint is **callable by anyone on the internet**:
```
POST https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push
{ "record": { "user_id":"<victim uuid>", "type":"system", "message":"<arbitrary push text>", "from_username":"..." } }
```
→ looks up the victim's tokens and delivers an arbitrary push banner. This needs only a victim `user_id`, and no DB row (so it's a vector *even after* F-4 is fixed).
*Cannot fully verify from the repo:* whether `verify_jwt=false` and whether `FUNCTION_SHARED_SECRET` is set are **deployment-config facts** not in the codebase (no `supabase/config.toml` present). But the wiring makes the two mutually exclusive with "push works": either push is broken, or the endpoint is open. Given `notify-push v2` shipped and works, the endpoint is almost certainly open.
*Elite fix:* set `FUNCTION_SHARED_SECRET` in the function's env **and** send it from the trigger, so the DB→function call is authenticated and public calls 401:
```sql
CREATE OR REPLACE FUNCTION public.tg_notify_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wihyqkpoymwcvbprslyz.supabase.co/functions/v1/notify-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-function-secret', current_setting('app.notify_push_secret', true)  -- or a hardcoded secret matching the env
    ),
    body    := jsonb_build_object('type','INSERT','table','notifications','record', to_jsonb(NEW))
  );
  RETURN NEW;
END;
$$;
```
Keep the function deployed with `--no-verify-jwt` (the webhook can't present a user JWT), but rely on the shared secret for authenticity. Verify in the Supabase dashboard that `FUNCTION_SHARED_SECRET` is set once both sides match.

---

## Part B (Round 3) — Social graph, forge & IDOR

### ✅ Follow / unfollow (`domain/socialSlice.ts` + `interactions` RLS) — CLEAN
- Follows are rows in `interactions` (`type` in follow/follow_request). Insert sets `user_id: <self>`; RLS `Users can insert their own interactions` (`WITH CHECK auth.uid() = user_id`) means passing anyone else's id **fails the check** — no forging a follow *from* another user. A RESTRICTIVE ban policy (`ban_block_interactions_insert` → `is_user_not_banned()`) additionally blocks banned users.
- Read RLS `interactions_select_authorized` scopes visibility to self / target / `can_view_user_data(...)` — not world-readable.

### ✅ Block (`blockStore.ts` + `user_blocks` RLS) — CLEAN
- Upsert sets `blocker_id: <self>` with `onConflict: blocker_id,blocked_id`; RLS is own-only for INSERT/SELECT/DELETE (`blocker_id = auth.uid()`). A user cannot create blocks for others or read another user's block list. Block list also fetched via `get_user_blocks` RPC.

### ✅ Report (`reportStore.ts` → `submit_report` RPC) — CLEAN (RPC layer)
- Reporting routes through the `submit_report` RPC. Migration `20260622_rpc_auth_hardening.sql:47-90` replaced it to derive `v_reporter_id := auth.uid()` and **insert that, ignoring the client-supplied `p_reporter_id`** (kept only for signature/offline-queue compatibility); rate-limit is keyed on the real caller; `SET search_path = public`; `EXECUTE` revoked from PUBLIC, granted to `authenticated`. The same migration hardened `get_priority_reports` (admin check added) and `claim_founding_seat` (grant lockdown to service_role). The `useReportUser` HOOK-1 fix also corrected the earlier bug where reports were written to the dead `user_reports` table the Tribunal never reads.
- `user_reports` SELECT policy is `USING (false)` — users can't read the report table.

### ⚠️ Findings (Round 3)

**F-6 · Permissive `reports` INSERT policy allows direct-PostgREST reporter forge (repo/live drift) — MEDIUM (needs live verification)**
`supabase/_schema_baseline.sql:5052` — `CREATE POLICY users_insert_reports ON public.reports FOR INSERT TO authenticated WITH CHECK (true)`.
This coexists (OR'd) with the correct `users_insert_own_reports` (`reporter_id = auth.uid()`). Because it's `WITH CHECK (true)`, an attacker can bypass the hardened `submit_report` RPC entirely and hit PostgREST directly:
```
POST /rest/v1/reports
{ "reporter_id":"<VICTIM uuid>", "content_id":"…", "content_type":"log",
  "reason":"…", "target_user_id":"<someone>", "status":"pending" }
```
→ a report is filed **as the victim**, poisoning their 10/hr rate-limit budget and framing them in the Tribunal queue (`reporter_id` is shown to admins). This is the table-level half of the "reporter-forge" hole; the RPC half is closed, this one isn't governed by any repo migration.
*Root cause:* legacy permissive policy captured in the 2026-06-27 schema baseline; the 2026-07-11 live security audit reportedly closed reporter-forge **on the live DB only** (memory: "audit-live-not-repo"). No committed migration drops it, so (a) it may still be live, and (b) any DB rebuild from repo reintroduces it.
*Cannot fully verify from repo:* whether the live DB still has this policy. **Confirm:** `SELECT polname, with_check FROM pg_policies WHERE tablename='reports' AND cmd='INSERT';`
*Elite fix (add as a committed migration so repo == live):*
```sql
DROP POLICY IF EXISTS "users_insert_reports" ON public.reports;
-- keep users_insert_own_reports (reporter_id = auth.uid());
-- report creation should go through submit_report() anyway.
```

**F-7 · Hardcoded admin UUID in `reports` RLS — LOW**
`supabase/_schema_baseline.sql:4581,4588` — `admin_select_reports` / `admin_update_reports` gate on `auth.uid() = 'd1c40ed8-…'::uuid`. These duplicate the role-based `admins_select_all_reports` / `admins_update_reports` (EXISTS-subquery) policies. Not a hole (grants to one known account), but brittle: rotating the admin account or adding a second admin requires a schema change, and a stray hardcoded id is an audit smell.
*Fix:* drop the two hardcoded-UUID policies; rely solely on the role-based admin policies.

---

## Part B (Round 4) — Content write paths & lounge realtime

### ✅ Log a film + log comments (`LogService.ts` + `logs` RLS) — CLEAN
- `logs` RLS is defense-in-depth: `logs_insert_rate_limit` (`auth.uid() = user_id` **AND** `rate_limit_check('logs', 'user_id', 200, 1440)` → 200/day), `logs_select_authorized` (`can_view_user_data(user_id)` — respects privacy), update/delete own, plus RESTRICTIVE `ban_block_logs_insert/update` (`is_user_not_banned()`).
- `LogService` validates every read row and write against zod schemas (logs Sentry drift), reconciles pending offline mutations, and handles the multi-device `private_notes` sync trap. `addLogComment` runs `sanitizeInput(body,'logComment')` at the service boundary (XSS choke point); `deleteLogComment` carries a defense-in-depth `.eq('user_id', self)`.

### ✅ Dossiers, certifications, physical archive, tickets — CLEAN
- `dispatch_dossiers`: drafts private (`manage own`), published world-readable (`is_published = true`), ban-gated insert/update.
- `dossier_certifications`: insert/delete own, public read (endorsements are meant to be public).
- `physical_archive` + `list_items`: the baseline's world-readable `USING (true)` SELECT was **already closed** by `20260709_02_vault_listitems_privacy_rls.sql` → now `can_view_user_data(user_id)` (list_items inherits parent list visibility). Insert/update/delete own. *(Baseline is a stale 2026-06-27 snapshot; the fix is a committed July migration.)*
- `tickets`: insert/select own only — ticket stubs are private.

### ✅ Lounge messages / reactions / membership (`lounge.ts` + overhaul RLS) — CLEAN
- Read: public-lounge OR **approved-member** only → private lounges are sealed (`20260627_01:90`). Send/react: `auth.uid() = user_id` AND approved membership; delete-reaction own-only; RESTRICTIVE ban gate on message insert.
- Client `sendMessage` sanitizes (`sanitizeInput`, 500-char cap), zod-validates the payload, does optimistic-insert-with-status → upsert `onConflict:id` → rollback on error → offline enqueue; realtime handler dedups by id and suppresses own optimistic echoes. `toggleReaction` is optimistic-delta with revert-on-failure.
- Membership mutations go through SECURITY DEFINER RPCs that **enforce host authorization** (e.g. `approve_lounge_member`: `IF auth.uid() <> creator_id THEN RAISE 'Only the host can admit members'`). No member can approve/decline/remove others.

### ⚠️ Findings (Round 4)

**F-8 · `error_logs` allows unauthenticated, unbounded inserts — LOW**
`supabase/_schema_baseline.sql:4059,4066` — `error_logs` has two `FOR INSERT ... WITH CHECK (true)` policies (one for `authenticated, anon`), and no `rate_limit_check` (unlike `logs`). No client code writes to `error_logs` (grep-clean), so this is a **latent** abuse vector: anyone can `POST /rest/v1/error_logs` to flood the table (storage-cost / noise), no auth required.
*Severity rationale:* LOW — unused by the app, bounded blast radius (DB rows/cost), not a data-exposure or integrity issue.
*Elite fix:* if error logging is done server-side/Sentry (it appears to be), drop the anon INSERT policy entirely; if client crash-reporting into this table is intended later, add a `rate_limit_check` clause like `logs` uses. Also collapse the duplicate policy.

*(Also noted, informational — not scored:* `dossier_comments` carries ~6 overlapping SELECT/INSERT/manage policies across the baseline + `20260625` migration — all secure, but redundant and worth consolidating for maintainability.)*

---

## Part B (Round 5) — Membership / entitlement money-path

### ✅ `sync-entitlement` edge function — CLEAN (strong trust boundary)
- **Ignores the client-supplied tier entirely.** Validates the JWT → `user.id`, then fetches authoritative entitlements from RevenueCat **server-to-server** (`GET /v1/subscribers/{user.id}` with `REVENUECAT_SECRET_KEY`), computes the highest active tier from cryptographically-verified truth, and writes `role`/`tier` with the **service-role** key. A jailbroken client cannot self-grant *through this function*. (Header comment says "client sends {tier}" — stale; the code is stricter than the comment.)
- Founding purchases route through the atomic, row-locked `claim_founding_seat` RPC (100-seat cap); RC has already charged by the time the fn runs, so an over-cap buyer still gets the `auteur` tier they paid for with `seatClaimed:false` surfaced. `claim_founding_seat` is `REVOKE EXECUTE FROM PUBLIC` (`20260622:329`) → callable only by service-role.

### ✅ Client money-path (`revenueCat.ts`, `useEntitlement.ts`, `tier.ts`) — CLEAN
- RevenueCat is identified with the Supabase user id (`configure({ appUserID: userId })`, `Purchases.logIn(userId)`), so the S2S lookup resolves. `useEntitlement` calls `sync-entitlement`, applies a **local-only** `setLocalTierHint` (no DB write), then polls `profiles.select('tier,role,is_founding')` until the webhook lands and calls `restoreSession`. `resolveTier` takes the highest watermark of `tier`/`role`/`is_founding`.
- **No client code anywhere in `src/` writes `role`/`tier`/`is_founding`/`is_banned` directly** (grep-clean). The client is fully disciplined.

### ⚠️ Findings (Round 5)

**F-9 · Client can self-elevate tier + evade bans by writing `profiles` directly — 🔴 BLOCKER**
`supabase/_schema_baseline.sql:4504` (`"Users can update own profile." FOR UPDATE USING (auth.uid() = id)`) + `supabase/migrations/20260626_02_profile_freeze_fix.sql` (freeze trigger confirmed **absent** on live) + no column-level `REVOKE` on `profiles`.
The `profiles` UPDATE policy has **no `WITH CHECK` and no column restriction**, there is **no BEFORE-UPDATE freeze trigger** (`20260626_02` verified `protect_profile_fields` does not exist on live and the real triggers touch only `updated_at`/privacy/username), and the `authenticated` role retains the default blanket `UPDATE` privilege on **all** columns. So any authenticated user can bypass the disciplined client with a raw PostgREST call against their **own** row:
```
PATCH /rest/v1/profiles?id=eq.<self>
Authorization: Bearer <own JWT>   apikey: <anon key>
{ "role":"auteur", "tier":"auteur", "is_founding":true, "is_banned":false, "suspended_until":null }
```
RLS check `auth.uid() = id` passes; nothing else constrains the columns. Confirmed impact (all three defeat systems audited elsewhere in this report):
1. **Revenue bypass** — free `auteur`/`archivist`; every paywalled feature unlocks. This is precisely what `sync-entitlement` was built to prevent (its own header: *"a jailbroken device could set role='auteur' without paying"*) — the boundary is simply side-stepped.
2. **Founding-seat cap bypass** — self-set `is_founding=true`, unlimited, ignoring the 100-seat `claim_founding_seat` counter.
3. **Moderation / ban evasion** — a banned user sets `is_banned=false`, `banned_at=null`, `suspended_until=null`; the RESTRICTIVE `is_user_not_banned()` gates on `logs`/`dossiers`/`lounge_messages`/`interactions` (Rounds 3–4) then read `false` → the ban system is defeated. `followers_count` can also be self-inflated.
*Root cause:* the client author knew this — `ProfileWriteService.ts:31-32` excludes `role` and notes *"Ensure Supabase RLS blocks this as well"* — but the server-side half was never implemented, and `20260626_02` explicitly decided the missing freeze was "nothing to fix" (backwards: the absence **is** the hole). Repo audit ref `BACKEND-PROFILE-FREEZE-1` was marked HIGH then closed as a no-op.
*Elite fix (server-side only, no app change — the client writes only the 7 safe columns below, so this breaks nothing):*
```sql
BEGIN;
-- Column-level privilege lockdown: strip the blanket UPDATE, re-grant only user-editable fields.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT  UPDATE (username, bio, avatar_url, display_name, persona, social_links, is_social_private)
  ON public.profiles TO authenticated;
-- service_role bypasses column grants → sync-entitlement + moderation RPCs still write role/tier/is_banned.
COMMIT;
```
Defense-in-depth (recommended alongside): add the intended `protect_profile_fields` BEFORE-UPDATE trigger that raises if a non-service-role session changes any privileged column. **Re-verify** after applying with a raw `PATCH` as a normal user (expect `401/403` on the privileged columns) and confirm legitimate edits (bio, avatar, etc.) still succeed.

---

## Part B (Round 6) — Moderation, ban enforcement & privacy internals

### ✅ Moderation resolve flow (`resolve_moderation_report_v2` + siblings) — CLEAN (admin auth), see F-10
- `resolve_moderation_report_v2`, `bulk_dismiss_reports`, `get_priority_reports`, `get_report_evidence` (`20260712_01`), and the `notification_voice` admin RPC all derive `v_admin_id := auth.uid()` (never the client `p_admin_id`), require `EXISTS (… role = 'admin')`, and `SET search_path = public`. Forge-proof: a non-admin passing someone else's `p_admin_id` is rejected. `ModerationService` routes exclusively through these RPCs; `tribunal.tsx` adds a client `user?.role !== 'admin'` guard (defense-in-depth; the real gate is server-side).
- The legacy unguarded `resolve_moderation_report` v1 was dropped (`20260620`), and `claim_founding_seat` locked to service-role — both confirmed in Round 3/5.

### ✅ Ban enforcement (`is_user_not_banned` + RESTRICTIVE policies) — CLEAN (design), see F-9
- `is_user_not_banned()` (SECURITY DEFINER, `search_path` set) is applied as a RESTRICTIVE `WITH CHECK` on inserts/updates to `logs`, `dispatch_dossiers`, `dossier_comments`, `interactions`, `lounge_messages` — a banned user's writes are blocked at the DB regardless of client. Design is sound; its **only** weakness is that the `is_banned` column it reads is client-writable (F-9), which lets a banned user un-ban themselves upstream of this check.

### ✅ Privacy internals (`can_view_user_data`, 2-tier visibility) — CLEAN
- `can_view_user_data(target_uid)`: self → TRUE; public profile (`is_social_private = false`) → TRUE; private profile → TRUE only if the caller has an approved `follow` interaction. SECURITY DEFINER, STABLE, `search_path` set. This one gate is applied consistently across `logs`, `physical_archive`, `list_items`, analytics RPCs, and interactions (the July privacy migrations), so sealed profiles are uniformly enforced. The vault/list_items gaps were the only omissions and are closed (`20260709_02`, Round 4).

### ⚠️ Findings (Round 6)

**F-10 · Admin role (`'admin'`) is not a permitted `profiles.role` value — MEDIUM (needs live verification)**
`supabase/_schema_baseline.sql` (profiles `check_role_valid` + `profiles_role_check`) vs the admin checks in `20260622_rpc_auth_hardening.sql:126,242,293`, `20260712_01:42`, `20260714_01:212`, `society_report_system.sql:226…`, reports RLS `admins_select_all_reports`/`admins_update_reports`, and client `tribunal.tsx:319,608`.
The **entire** moderation authorization model — client guard, reports RLS, and every admin RPC — keys on `profiles.role = 'admin'`. But the two committed `profiles` CHECK constraints permit only `{cinephile, archivist, auteur, projectionist, free}` — **`'admin'` is not allowed** (while `'projectionist'`, which no code references, is). No migration reconciles this.
*Consequence:* either (a) the live constraint silently differs from the repo (drift — the admin account was set to `'admin'` via an out-of-repo change or grandfathered before the constraint), meaning a rebuild-from-repo yields a DB where **no admin can exist and the Tribunal resolve flow is dead**; or (b) if the live constraint really forbids `'admin'`, moderation is already non-functional. Given the shipped tribunal, (a) is likely — but it's undocumented and unverifiable from the repo.
*⚠️ Interaction with F-9:* the constraint currently provides *accidental* protection — F-9 lets users self-set `role` only to a CHECK-valid value, and `'admin'` isn't one, so F-9 can't self-grant admin **today**. If F-10 is "fixed" by adding `'admin'` to the constraint **without** first fixing F-9's column lockdown, any user could then `PATCH role='admin'` → full moderation takeover (ban anyone, resolve/dismiss reports). **Fix F-9 and F-10 together.**
*Cannot fully verify from repo:* the live constraint definition and the founder account's actual role. Confirm: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND contype='c';` and `SELECT id, role FROM profiles WHERE role='admin';`
*Elite fix (coordinated):* first apply F-9's column REVOKE/GRANT (so `role` is not client-writable), then consolidate the two redundant role constraints into one canonical `CHECK (role = ANY(ARRAY['free','cinephile','archivist','auteur','admin']))` reflecting the real role set (drop or migrate the unused `'projectionist'`). Keep admin assignment a service-role-only operation.

---

## Part B (Round 7) — Remaining read services & edge functions

### ✅ Community/following/stacks feed (`FeedService.ts`) — CLEAN (notably injection-safe)
- Cursor parts (`created_at|id`) are validated against **anchored regex** (`ISO_TIMESTAMP_RE`, `UUID_RE`) before being string-interpolated into PostgREST `.or()` filters — a malformed/injection-laden cursor fails the shape check and degrades to a safe first-page fetch. Search terms pass through `escapeSearchPattern` before `ilike` interpolation. This closes the main PostgREST filter-injection risk.
- Uses server-side block-filtering RPCs (`get_community_feed_auth_cursor`, `get_following_feed_auth_cursor`, `get_filtered_stacks_auth_cursor`, `20260620_feed_block_filtering`) so blocked/muted authors are excluded server-side. Rows parsed with batch→per-row salvage + Sentry telemetry. *(The direct-query fallback path — used only if an RPC is missing — cannot block-filter; it's documented and the RPCs are deployed.)*

### ✅ Film / dossier / follow-request / news / profile-data / year-in-cinema — CLEAN
- `FilmService`, `YearInCinemaService` read `logs` gated by `logs_select_authorized` (`can_view_user_data`) → private users' entries don't leak into public film reviews or year stats. `ProfileDataService` is read-only through privacy-gated RPCs (`get_public_profile_analytics`, `get_profile_counts`, `get_user_analytics`). `DossierService` writes (comment/edit/delete) are ownership-scoped (`.eq('user_id', self)` + RLS) with zod validation and injected username. `FollowRequestService` reads incoming requests via `interactions` (RLS-safe) and accepts via the `accept_follow_request` RPC.
- `NewsService` only ever sends a single hardcoded feed URL (`RSS_FEEDS = ['…theguardian.com/film/rss']`) to `fetch-rss`; results render in RN `Text` (auto-escaped) → no HTML/XSS injection from feed content.

### ✅ `tmdb-proxy` edge function — CLEAN
- Per-IP rate limit (60/min), **path allowlist** (blocks arbitrary-endpoint abuse), 10s timeout, server-side key, and suppresses TMDB error bodies so the key can't leak. This is the server-side home of the key that F-1 notes the client still keeps a fallback copy of.

### ⚠️ Findings (Round 7)

**F-11 · `fetch-rss` is an unauthenticated, un-rate-limited relay — LOW**
`supabase/functions/fetch-rss/index.ts:38-63` — accepts any client `url` (validated only as `http(s)://`) and relays it through `api.rss2json.com`. No JWT, no rate limit, no host allowlist (unlike `tmdb-proxy`). It only ever connects to the fixed `rss2json` host (the client URL is a query param), so there's **no internal SSRF**; the residual is a mild open-relay/amplification vector (an attacker can make rss2json fetch arbitrary URLs and get parsed results back). The app itself only sends one hardcoded feed, so blast radius is low.
*Elite fix:* mirror `tmdb-proxy` — add per-IP rate limiting and an allowlist of permitted feed hosts (or the exact `RSS_FEEDS` set), and consider requiring the anon JWT.

### 🧭 Coverage note — what Round 7 did *not* cover
Round 7 traced the **data/logic/read-path** behind the remaining screens (reels, feed, film, profile, search, year-in-cinema, settings, the modals) via their services and stores, and confirmed the read paths are privacy-gated, validated, and injection-safe. It did **not** perform exhaustive **visual/layout integrity** QA (Scope §5) — overlap/clipping/breakpoints/z-index/dynamic-content-overflow on every screen — because that is on-device/manual QA and is already tracked on the launch checklist's "device pass." No launch-blocking *logic* defects were found in the screens' data paths; the visual pass remains genuinely un-done and should not be assumed clean.

---

## Part B (Deep-verification pass) — findings re-tested to ground truth + 1 new finding

Each finding was re-examined against the `_schema_baseline.sql` pg_dump (real live snapshot) and every superseding migration, to rule out false-positives/intentional-design and to lock the elite fix.

- **F-9 — RE-CONFIRMED to ground truth (not a false positive, not intentional).** Baseline shows `GRANT ALL ON TABLE public.profiles TO authenticated` (line 5887) and **zero** column-level grants anywhere; the only profiles BEFORE-UPDATE triggers (`set_profiles_updated_at`, `tr_handle_privacy_switch`, `tr_profiles_username_policy`) don't touch privileged columns; no later migration adds protection. **Intent to block is proven** by (a) the `ProfileWriteService.ts:31-32` comment and (b) the house's own `protect_video_review_metrics` trigger that guards the analogous columns on `video_reviews` — profiles is simply the omission. **Exact safe-column set locked:** the only two client `profiles.update()` sites (`ProfileWriteService.ts:71`, `auth.ts:213`) write exactly `username, bio, avatar_url, display_name, persona, social_links, is_social_private`; `preferences` goes through a SECURITY DEFINER RPC; bans are applied inside `resolve_moderation_report_v2` (SECURITY DEFINER). **∴ the column-grant fix is provably non-breaking**, and is superior to a trigger here (a trigger would also revert `sync-entitlement`'s service-role writes; column privileges are bypassed by service_role automatically).
- **F-4 — RE-CONFIRMED.** No RESTRICTIVE notification INSERT policy exists; `20260702_04`'s permissive `WITH CHECK (from_user_id = auth.uid())` is the sole thing enabling client inserts (prior state was deny-by-default). Dropping it restores the secure default.
- **F-5 — strengthened.** Deduction: the pg_net webhook sends only `Content-Type` (no JWT/apikey/secret); for it to deliver, the function MUST run `verify_jwt=false` AND `FUNCTION_SHARED_SECRET` MUST be unset — the same two conditions that make it internet-open. Since push demonstrably works, both hold. Still: confirm in dashboard.
- **F-6 — RE-CONFIRMED in baseline; live-state pending.** `users_insert_reports WITH CHECK (true)` is permissive with no restrictive counter → direct-REST forge. No repo migration drops it.
- **F-10 — refined.** The tribunal likely works on live (implies live drift: `'admin'` permitted out-of-repo or grandfathered). The real risks are (i) rebuild-from-repo yields a DB where no admin can exist, and (ii) the F-9 coupling. Fix in the same window as F-9.

**F-12 · `resolve_moderation_report_v2` writes non-existent notification columns / invalid type — HIGH (needs live verification)**
`supabase/migrations/20260714_01_notification_voice.sql:275,296` (the current resolver).
The function inserts `notifications (user_id, type, title, body, message, metadata)` with `type = 'moderation'`. After tracing every migration, the notifications table has columns `{id,user_id,type,from_username,message,is_read,created_at,updated_at,related_lounge_id,film_id,poster_path,from_user_id}` — **no `title`, `body`, or `metadata`** — and its `type` CHECK permits only `{follow,endorse,comment,annotate,retransmit,system,reaction,follow_request,follow_accept}` — **not `'moderation'`**. `p_notify_user` defaults to **true**, so on a repo-built DB, resolving *any* report throws `42703`/`23514` and **rolls back the whole enforcement transaction** (no ban/suspend/warn applied, report stays pending) — the Tribunal's core action is dead.
*Why it may pass on live:* the `20260714_01` header states prior moderation notices "were written to title/body" — which only succeeds if those columns exist **on live** (added out-of-repo), implying `type='moderation'` is also permitted on live. So this is most likely **repo↔live drift** (live works; the repo cannot reproduce it and a rebuild breaks moderation) — but if those columns/type are *not* actually on live, **moderation is broken in production right now.** Either way it's launch-relevant (moderation is a safety-critical system) and must be reconciled.
*Cannot fully verify from repo.* Confirm: `SELECT column_name FROM information_schema.columns WHERE table_name='notifications';` and `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.notifications'::regclass AND contype='c';`
*Elite fix (make repo == live AND make the function robust):* prefer changing the **function** to use the real schema rather than perpetuating phantom columns —
```sql
-- 1. Allow the 'moderation' type (single canonical constraint).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD  CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['follow','endorse','comment','annotate','retransmit','system',
                           'reaction','follow_request','follow_accept','moderation']));
-- 2. Redefine resolve_moderation_report_v2 to INSERT only real columns (user_id, type, message[, metadata if you add it]).
--    Drop title/body from the INSERT; keep `message` (which the client renders).
```
If `title`/`body`/`metadata` genuinely exist on live and are wanted, instead add a committed migration creating them (`ADD COLUMN IF NOT EXISTS`) so repo matches — but dropping the phantom columns from the function is cleaner.

---

## Part B (Deep-verification pass 2) — exhaustive gap-closing → 5 new findings + a systemic pattern

Going wider than the original 7 rounds (storage RLS, the signup trigger, `preferences`/`email` column exposure, and **every** write-capable SECURITY DEFINER function) surfaced five more issues — and one meta-conclusion.

### 🔴 META-FINDING · The repo cannot reproduce the live database's security state
Multiple security fixes from prior live audits (email-harvest, follow-count vandalism, reporter-forge table policy, profile-freeze, admin role, moderation notification columns) were applied **directly to the live DB and never back-ported to committed migrations.** Consequence: `_schema_baseline.sql` + `supabase/migrations/*` **cannot rebuild a secure database** — a fresh deploy/DR-restore would reopen several closed holes. Several findings below are therefore *"probably already patched on live, but unverifiable from the repo and un-reproducible."* **The single most valuable remediation is a "repo == live" reconciliation pass**: run the live `pg_policies` / `information_schema` / `pg_proc` state, diff against repo, and commit migrations that codify every live-only fix. Until then, treat the DB as un-rebuildable.

**F-13 · Storage (avatars bucket) RLS is not in the repo — could not verify (potential IDOR)**
No `storage.objects`/bucket policy exists anywhere in `supabase/` (dashboard-managed). `ProfileWriteService` uploads/lists/removes under `avatars/{userId}/…`. If the bucket's policies aren't scoped to `(storage.foldername(name))[1] = auth.uid()::text`, a user could overwrite or delete **another user's avatar**. *Cannot verify from repo.* **Confirm** the avatars bucket SELECT/INSERT/UPDATE/DELETE policies in the dashboard; ensure write/delete are owner-folder-scoped and commit them as a repo artifact.

**F-15 · `profiles.email` is world-readable (email harvesting) — HIGH (needs live verify; drift)**
`profiles` has an `email` column (written by `handle_new_user`), the SELECT policy is `USING (true)`, and `GRANT ALL` is held by `anon`+`authenticated`. The only email protection in-repo (`20260626_07`) locks the `get_email_by_username` **RPC** — it does nothing about a direct `GET /profiles?select=id,username,email`. Memory says email-harvest was "closed 2026-07-11," but that fix (a column `REVOKE SELECT(email)`) is **not in the repo**. So: likely patched live, definitely un-reproduced in repo, and **must be confirmed** — if not live, every user's email is currently harvestable. *Fix (fold into the F-9 profiles migration):* `REVOKE SELECT (email) ON public.profiles FROM anon, authenticated;` (no client reads `profiles.email` — it uses the auth-session email — so this is non-breaking; service_role retains access).

**F-16 · `batch_insert_list_items` — inject items into ANY user's list (IDOR) — MEDIUM**
`supabase/_schema_baseline.sql` (SECURITY DEFINER, `GRANT … TO authenticated`). Its guard is `EXISTS (SELECT 1 FROM lists WHERE id=p_list_id AND user_id=p_owner_id)` — it verifies the list belongs to the *claimed* owner but **never checks `p_owner_id = auth.uid()`**. An attacker passes a victim's `list_id`+`user_id` (both discoverable), the check passes, and SECURITY DEFINER bypasses `list_items` RLS → items injected into the victim's curated list. Same client-param-trust class as the old reporter-forge, but this function was **missed** by the `20260622` hardening sweep. **It's dead code client-side** (the app uses direct upsert), so most likely still open on live. *Elite fix:* `DROP FUNCTION public.batch_insert_list_items(uuid,uuid,jsonb);` (removes a dead, exploitable SECURITY DEFINER surface). If kept, harden: guard on `WHERE id=p_list_id AND user_id=auth.uid()` and ignore `p_owner_id`.

**F-17 · `increment/decrement_follow_counts` callable by anyone (follow-count vandalism) — MEDIUM (drift)**
`_schema_baseline.sql:5248-5250,5490-5492` — both are `GRANT ALL … TO anon, authenticated`, so a raw `rpc('increment_follow_counts',{follower_id,followed_id})` with arbitrary ids inflates/deflates **anyone's** follower/following counts. They should be trigger-only. Memory says follow-count vandalism was "closed 2026-07-11," but no repo migration revokes them → drift. *Fix:* `REVOKE EXECUTE ON FUNCTION public.increment_follow_counts(uuid,uuid), public.decrement_follow_counts(uuid,uuid) FROM anon, authenticated, PUBLIC;` (trigger `handle_follow_count_change` runs as definer and is unaffected). Confirm live state first.

**F-14 · `preferences` JSONB world-readable via raw REST — LOW/MED (privacy)**
`profiles.preferences` is exposed by the `USING(true)` + `GRANT ALL` combo. The client is careful (`ProfileDataService` reads full `preferences` only for self; for others it extracts only `programmes`/`favorites`/`hide_stats`, per the "avoid leaking preferences (oracle_persona, notify settings)" comment) — but raw REST ignores that discipline, so `GET /profiles?select=preferences&id=eq.<victim>` returns the full settings blob. *Fix (not server-only — flag):* the clean solution promotes the 3 public sub-keys to real columns (or a `public_prefs` jsonb) and `REVOKE SELECT(preferences)`, which needs a coordinated client change; a server-only alternative is a SECURITY DEFINER `get_public_profile()` RPC that returns only whitelisted fields. Lower priority given low sensitivity.

### ✅ Re-verified CLEAN in this pass (ruling out false alarms)
- **Signup role-injection — SAFE.** `handle_new_user` clamps `role` to `venue_owner`|`cinephile` via a CASE; signup metadata `role:'admin'`/`'auteur'` is ignored. No signup escalation.
- **`update_my_preferences` — SAFE.** Derives `auth.uid()`, no user-id param, merges JSONB `WHERE id = auth.uid()`.
- **`process_secure_tip` — SAFE.** Derives sender from `auth.uid()`, validates amount; also unused by client (tips dormant).
- **`process_user_report` — not exploitable.** It's a trigger (uses `NEW.reported_id`); the `authenticated` grant is inert for trigger functions.
- **Other write SECURITY DEFINER fns** (`create_lounge_with_member`, `accept/decline_follow_request`, lounge host RPCs) all derive identity from `auth.uid()`.
- **F-9 write-surface fully enumerated** — only 2 client `profiles.update()` sites; no client insert/upsert; RLS enabled; exactly one UPDATE policy. Column-grant fix is airtight.

---

## Part B (Deep-verification pass 3) — systematic sweeps → CONVERGENCE

Two exhaustive systematic checks were run to close the last repo-discoverable gaps:
- **✅ RLS-enabled on every table.** All 35 public tables (plus `interactions_queue_buffer`) carry `ENABLE ROW LEVEL SECURITY`. There is **no** table relying on `GRANT ALL` without RLS — no wide-open surface.
- **✅ Full function-grant sweep.** Every SECURITY DEFINER function granted to `anon`/`authenticated` was classified: identity-from-`auth.uid()` (safe: submit_report, resolve_*, create_lounge_with_member, accept/decline_follow_request, delete_list_cascade [verified `v_owner_id = auth.uid()`], update_my_preferences, process_secure_tip, replace_list_items, get_user_lounges…), trigger-only (inert grants: handle_*, notify_on_*, increment_video_tips, process_user_report…), already-locked (claim_founding_seat, get_email_by_username), or **flagged** (F-16 batch_insert_list_items, F-17 follow-counts). The `20260609` hardening sweep is confirmed to have converted the lounge/list/analytics functions to `auth.uid()` — F-16/F-17 are the functions it **missed**, confirming they're real gaps.

**F-18 · `increment_video_views` inflatable — LOW.** `increment_video_views(p_video_id)` is SECURITY DEFINER granted to `anon`; a raw call bumps any video's view count with no dedupe/rate-limit → vanity-metric inflation. Dormant feature (video_reviews). *Fix:* rate-limit or dedupe server-side (same family as F-17); lowest priority.

### 🎯 Convergence statement (important, honest)
Three deep passes have now covered every repo-discoverable surface: all tables' RLS, all policies, every write-capable SECURITY DEFINER function and its grants, column-level exposure (`email`, `preferences`), the signup trigger, storage references, and all edge functions. **The finding set is now stable** — pass 3 produced only one LOW plus clean confirmations, which is the signal of completeness. **The remaining uncertainty is not resolvable by more repo reading** — it is live-DB state (the "drift" items: F-5, F-6, F-10, F-12, F-13, F-15, F-17). Those require the Phase-0 live queries. Continuing to re-scan the repo would risk manufacturing marginal findings, which this audit explicitly forbids. **Next action should be Phase 0 (live verification), not a 4th repo pass.**

---

## Part B (Phase 0) — LIVE VERIFICATION RESULTS (queried live DB 2026-07-17)

The master matrix was run against production. Results reclassify every drift item into a definite state:

### 🔴 CONFIRMED LIVE-OPEN (fix required)
- **F-9 (BLOCKER) — verified exploitable.** `authenticated` CAN UPDATE `role`, `tier`, `is_founding`, `is_banned` (all TRUE). **Escalated:** the live `role` CHECK constraint **allows `'admin'`** (TRUE) — so F-9 doesn't just grant paid tiers + ban-evasion, it lets any user `PATCH role='admin'` → **full moderation takeover** (ban anyone, read/resolve the report queue). This is now a self-serve-admin hole, live right now.
- **F-15 (HIGH) — verified, worse than thought.** BOTH `anon` **and** `authenticated` can `SELECT profiles.email` (both TRUE) → every user's email is harvestable **without even logging in**.
- **F-4 (HIGH) — verified.** The client-INSERT notifications policy (checks `from_user_id`) is present on live → spoof + push amplification is open.
- **F-12 (HIGH) — verified LIVE-BROKEN (not just drift).** Live notifications has **no** `title`/`body`/`metadata` columns AND the `type` CHECK **forbids `'moderation'`** (all FALSE). The resolver's default `notify=true` path therefore **errors and rolls back on live** → resolving a report (ban/suspend/warn) **fails in production today.** Moderation is functionally down for its core action.
- **F-5 (HIGH) — confirmed half.** The push trigger sends **no** `x-function-secret` (FALSE) → the shared-secret gate is off. (Still confirm `verify_jwt` in the dashboard for the endpoint-open conclusion.)
- **F-14 (LOW/MED) — verified.** `preferences` readable by `authenticated` (TRUE); `profiles` SELECT is `USING(true)` (TRUE).
- **F-18 (LOW) — verified.** `increment_video_views` is anon-callable (TRUE).
- **F-8 (LOW) — refined.** `error_logs` INSERT is `authenticated`-only (anon policy already dropped on live), `with_check=true`.

### ✅ CONFIRMED ALREADY-FIXED ON LIVE → downgrade to *repo back-port only*
Prior live audits closed these; they are **not exploitable on live**, but no committed migration captures the fix, so a rebuild would reopen them. Action = commit a migration so repo == live.
- **F-6** — no permissive `reports` INSERT `true` policy on live (FALSE).
- **F-16** — `batch_insert_list_items` not callable by `authenticated` (FALSE; dropped/locked live).
- **F-17** — `increment/decrement_follow_counts` not callable (FALSE; revoked live).
- **F-10** — live `role` constraint **allows `'admin'` and 1 admin account exists** → the Tribunal is *not* broken; this is pure repo drift. (Note: this is exactly what makes F-9's admin-takeover possible — so F-9's fix is the containment.)

### Detail-query results (live, 2026-07-17)
- **F-4 exact culprit:** policy `"Users can send notifications from themselves"` (INSERT, `WITH CHECK from_user_id = auth.uid()`). All other notifications policies are correctly `auth.uid() = user_id`-scoped. Fix = drop that one policy.
- **F-7 — already fixed live.** No hardcoded-UUID admin policies remain on `reports`; only role-based `admins_select_all_reports`/`admins_update_reports`. Back-port only.
- **F-6 — already fixed live** (confirmed: no `users_insert_reports` policy present).
- **F-13 — CLEAN, not a vulnerability.** All avatar write policies (INSERT/UPDATE/DELETE) are owner-folder-scoped: `bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]`; SELECT is public-read (correct for avatars). No IDOR. Only gap: not captured in repo → optional back-port.
- **F-12 fix decision = schema-additive (lowest risk):** the live resolver body writes `title`/`body`/`message`/`metadata` + `type='moderation'`. Rather than rewrite the whole SECURITY DEFINER function (risk of regressing an out-of-repo body), the elite low-risk fix is **purely additive**: `ALTER TABLE notifications ADD COLUMN title/body (text), metadata (jsonb)` + extend the `type` CHECK to include `'moderation'`. The existing function then succeeds unchanged and `message` still drives client rendering. (Optional later cleanup: slim the function to `message`-only.)

**Net effect on the plan:** the live-open set shrank to **F-9, F-15, F-4, F-12, F-5, F-14, F-18, F-8** (+ F-13 pending); **F-6/F-16/F-17/F-10 become back-port migrations** (not launch-blockers). F-9 and F-12 are the two that matter most — F-9 is worse (admin takeover) and F-12 means moderation is already broken.

---

## Part C — FINAL SUMMARY (Rounds 1–7 + 3 deep passes + Phase-0 live verification)

**Launch-readiness verdict: Ready with fixes — hold the public launch until F-9 is closed; F-4/F-5/F-6/F-10 immediately after.** The application code is mature and genuinely well-engineered: the auth/session lifecycle, optimistic-write persistence with rollback, forge/IDOR resistance across the social graph, content-write sanitization + rate/ban gates, the RevenueCat trust boundary, the 2-tier privacy model, and PostgREST filter-injection defenses are all solid. **Every blocking issue is a server-side RLS/grant/config gap, not an app-code defect — so every fix ships without a new client build or app-store review.** That is the good news: the fixes are fast and the app binary is fine.

But it cannot go public as-is because of **F-9 (BLOCKER)**: any authenticated user can `PATCH` their own `profiles` row to self-grant paid tiers for free, self-assign founding status past the 100-seat cap, and un-ban/un-suspend themselves — one request that defeats both monetization and moderation, sitting right behind the well-built `sync-entitlement` boundary it side-steps. The two Round-2 **HIGH** issues (F-4/F-5: arbitrary sender-impersonating push + in-app notification spam) and two **MEDIUM** drift issues (F-6 reporter-forge table policy, F-10 admin-role vs CHECK-constraint — which must be fixed *together with* F-9) round out the must-fix set.

**Recommended sequence:** (1) reproduce F-9 on staging → apply the column REVOKE/GRANT; (2) F-10 constraint reconcile in the *same* change window as F-9; (3) F-4 + F-6 drop the permissive policies; (4) F-5 wire the push shared secret; (5) sweep the LOW items; (6) run the live `pg_policies` verification queries listed under *Could-not-fully-verify*; (7) on-device visual/interaction QA pass (the launch checklist's "device pass").

### Punch list (all rounds, blocker→low)
| # | Sev | Item | Location | Fix type |
|---|---|---|---|---|
| **F-9** | **🔴 BLOCKER** | Client self-elevates tier / evades bans via direct `profiles` PATCH | `_schema_baseline.sql:4504` + `20260626_02` | Column REVOKE/GRANT (SQL) |
| **F-4** | **HIGH** | Permissive notifications INSERT RLS → spoof + push amplification | `migrations/20260702_04:26` | Drop policy (SQL) |
| **F-5** | **HIGH** | `notify-push` likely unauthenticated (shared secret not wired) | `functions/notify-push:73` + `migrations/20260626_11:26` | Wire shared secret (SQL + env) |
| **F-12** | **HIGH** | Moderation resolver writes non-existent notification cols / invalid type → repo-build breaks Tribunal (live drift) | `migrations/20260714_01:275,296` | Fn + constraint reconcile (SQL) |
| **F-15** | **HIGH** | `profiles.email` world-readable → email harvesting (drift) | `_schema_baseline.sql:26` + SELECT USING(true) | `REVOKE SELECT(email)` (SQL) |
| **F-6** | **MED** | Permissive `reports` INSERT policy → direct-REST reporter forge (repo/live drift) | `_schema_baseline.sql:5052` | Drop policy (SQL) |
| **F-10** | **MED** | Admin role `'admin'` not permitted by `profiles` CHECK constraint (drift; interacts w/ F-9) | `_schema_baseline.sql` role constraints | Constraint reconcile (SQL) |
| **F-16** | **MED** | `batch_insert_list_items` IDOR → inject items into any user's list | `_schema_baseline.sql` (fn) | Drop/harden fn (SQL) |
| **F-17** | **MED** | `increment/decrement_follow_counts` callable → follow-count vandalism (drift) | `_schema_baseline.sql:5248,5490` | REVOKE EXECUTE (SQL) |
| **F-13** | **MED?** | Avatar storage RLS not in repo — unverifiable (potential IDOR) | dashboard (storage.objects) | Verify + commit policies |
| F-14 | LOW/MED | `preferences` JSONB world-readable via raw REST | `profiles` SELECT USING(true) | Promote sub-keys + REVOKE, or RPC |
| F-1 | LOW | TMDB key bundled as direct fallback (key in bundle regardless) | `src/lib/tmdb.ts:190` + client env | Remove client key + fallback |
| F-2 | LOW | Stale callback-URL doc comment | `app/auth-callback.tsx:19` | Doc |
| F-3 | LOW | Multi-key preference rollback edge case (self-heals) | `src/stores/auth.ts:359` | Code |
| F-7 | LOW | Hardcoded admin UUID in `reports` RLS (⚠️ don't drop until F-10 confirms `role='admin'` works) | `_schema_baseline.sql:4581` | Drop policy (SQL) |
| F-8 | LOW | Unauthenticated unbounded `error_logs` inserts (client unused) | `_schema_baseline.sql:4059` | Drop/limit policy (SQL) |
| F-11 | LOW | `fetch-rss` unauthenticated/un-rate-limited relay | `functions/fetch-rss:38` | Rate-limit/allowlist (edge fn) |
| F-18 | LOW | `increment_video_views` inflatable (metric vandalism, dormant) | `_schema_baseline.sql` (fn) | Rate-limit/dedupe (SQL) |

### Round completion (all 7 done)
1. ✅ Config/env, auth lifecycle, list persistence (R1) — F-1/F-2/F-3
2. ✅ Notifications + push (R2) — F-4/F-5
3. ✅ Social graph forge/IDOR (R3) — F-6
4. ✅ Content writes + lounge realtime (R4) — F-8
5. ✅ Membership money-path (R5) — **F-9**
6. ✅ Moderation + ban + privacy internals (R6) — F-10
7. ✅ Remaining read services + edge functions (R7) — F-11

**Not a code deliverable this pass (tracked, not blocking logic):** exhaustive per-screen visual/layout QA (device pass); `InteractionService` full read-side; deep read of every one of the ~38 screens' render code (data paths behind them were traced via services/stores).

### Could-not-fully-verify
- **F-5 deployment config** — whether `notify-push` runs with `verify_jwt=false` and whether `FUNCTION_SHARED_SECRET` is set live are dashboard/CLI facts, not in the repo (no `supabase/config.toml`). The static evidence points to an open endpoint; **confirm in the Supabase dashboard** before/while applying the fix.
- **F-6 live policy state** — whether the permissive `users_insert_reports (WITH CHECK true)` policy still exists on live (the 2026-07-11 audit may have dropped it live-only). Confirm with the `pg_policies` query above. Regardless of live state, the repo needs a committed migration so a rebuild can't reopen it.
- **F-9 live confirmation (do this first)** — the finding is derived from repo evidence (RLS policy body, the `20260626_02` note that the freeze trigger is absent, and the absence of any column `REVOKE`). Confirm live with `SELECT grantee, privilege_type FROM information_schema.column_privileges WHERE table_name='profiles' AND column_name IN ('role','tier','is_founding','is_banned') AND grantee='authenticated';` (expect rows = vulnerable) and by attempting the raw `PATCH` above with a throwaway account on a staging copy. This is the one finding worth reproducing before anything else ships.
- **Live DB RLS state** — F-4 assumes both INSERT policies coexist on the live DB (both migrations applied, neither dropped later — grep-confirmed in-repo). Confirm with `SELECT polname, cmd, qual, with_check FROM pg_policies WHERE tablename='notifications';` on the live DB.
- **F-10 live constraint + admin account** — confirm `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND contype='c';` and `SELECT id, role FROM profiles WHERE role='admin';` on live. Determines whether this is benign drift or a broken Tribunal.
- **Live DB schema vs migrations** — verified statically (table names, `rank_position`, `from_user_id` add). Confirming the running schema matches needs a live query against `wihyqkpoymwcvbprslyz`.
- **Per-screen visual/layout integrity (Scope §5)** — not audited from source; requires the on-device QA pass on the launch checklist.
- **RevenueCat / Sentry / push delivery** — third-party runtime behavior can't be verified from source alone.
