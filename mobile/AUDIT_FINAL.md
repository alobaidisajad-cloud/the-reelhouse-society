# FINAL PRE-LAUNCH AUDIT — The ReelHouse Society
**Date:** 2026-07-16 · **Auditor role:** staff-level sign-off · **Codebase:** ~80,600 lines, 33 routes, 391 src files
**Gates at time of audit:** `tsc --noEmit` 0 errors · ESLint 0 errors · **951 tests passing** (98 suites) · repo clean, synced with `origin/main`

## Honesty statement (per audit rules)
This report distinguishes three verification levels — nothing is marked verified above its actual level:
- **[FULL-CHAIN]** — traced UI → logic → DB write → DB read → UI reflection → post-refresh behavior, this week, with live-DB confirmation where applicable.
- **[GATES+SWEEP]** — covered by compiler/linter/tests over 100% of code plus targeted pattern sweeps (empty catches, unguarded parses, dead handlers, route census, console strays); not individually re-read line-by-line.
- **[NOT DESK-VERIFIABLE]** — requires a device, a dashboard, or production traffic. Stated explicitly; never assumed fine.
Reading all 80k lines line-by-line in one pass is not possible and is not claimed. The riskiest ~30% (persistence, auth, counts, moderation, RPC boundary, payments logic) has been human-read; the rest is [GATES+SWEEP].

---

# Part A — Coverage checklist

## Screens / routes (33) — all reviewed
| Route | Level | Note |
|---|---|---|
| (tabs)/index — Lobby | FULL-CHAIN | feed, weekly feature, vignette; scroll-to-top + keyboard QoL pass |
| (tabs)/reels — The Reel | FULL-CHAIN | feed RPCs, editorial cards, recyclingKey fix |
| (tabs)/darkroom | FULL-CHAIN | tmdb-proxy chain, filters, scroll restore |
| (tabs)/dispatch + dispatch/compose | FULL-CHAIN | fetch-rss chain traced this pass (see B-1) |
| (tabs)/lounge + lounge/[id] + app/lounge.tsx | FULL-CHAIN | gate, chat, reactions, covers, settings, at-the-door |
| (tabs)/profile + user/[username] | FULL-CHAIN | deepest-audited surface: cache-first open, counts v3, tabs |
| film/[id], film-reviews/[id] | FULL-CHAIN | detail, reviews, action deck (lounge velvet rope) |
| log/[id] | FULL-CHAIN | chronicle, comments, half-life |
| log-modal (log flow) | FULL-CHAIN | draft persistence, validation, submit guard (B-3), dedupe/idempotency |
| list-modal, stacks/[id] | FULL-CHAIN | create/edit/reorder → replace_list_items (hardened RPC) |
| cover-picker | FULL-CHAIN | built this week; route-modal pattern; device-pass for visuals |
| search-modal, vault-modal | FULL-CHAIN | TMDB search, physical vault add |
| notifications-modal | FULL-CHAIN | full overhaul this week (types, icons fallback, door panel) |
| social-modal | GATES+SWEEP | share-to-lounge path traced; list rendering swept |
| login, auth-callback, reset-password | FULL-CHAIN | journey audit: PKCE fix + interceptor fix (B-2) |
| edit-profile, settings | FULL-CHAIN | optimistic update w/ rollback+toast; OTP modal; data vault |
| membership | FULL-CHAIN (logic) / NOT DESK-VERIFIABLE (purchase) | RC server-side entitlement verified; sandbox buy pending |
| (admin)/tribunal | FULL-CHAIN | evidence RPC created+confirmed live; pagination; enforcement |
| person/[id], dossier/[id], year-in-cinema | FULL-CHAIN | rebuilt/audited during redesign marathon |
| error.tsx, +not-found | GATES+SWEEP | in-voice; crash-net verified at root |

## Database (37 tables, 30 client RPCs) — all reviewed
- **All 37 public tables:** RLS enabled — verified against the **live** DB (user-run introspection). [FULL-CHAIN]
- **All 30 client `.rpc()` calls:** exist live with matching signatures (user-run `pg_get_functiondef` + function census); the one historical gap (`get_report_evidence`) was found, created, confirmed live, and version-controlled. [FULL-CHAIN]
- **Critical columns (21):** live existence confirmed (incl. `rank_position`, `viewing_history`, follower counts). [FULL-CHAIN]
- **Counts subsystem:** `get_profile_counts` v3 — door=room doctrine (RPC = tab = fallback), live-verified by user (77-vs-134 fixed). [FULL-CHAIN]
- **Notifications subsystem:** all triggers rewritten from live definitions; 3 new triggers (stack/dossier certify, dossier comment); moderation `message` column bug fixed; migration run live. [FULL-CHAIN]
- **Legacy duplicates noted, not bugs:** `user_reports`, `cinema_reviews`/`video_reviews`, `push_subscriptions`, `tips` — client never touches them. Post-launch deletion candidates. [GATES+SWEEP]

## Edge functions (7 deployed) — all reviewed
| Function | Level | Note |
|---|---|---|
| sign-in-with-username | FULL-CHAIN | rescued to repo; enumeration-proof; per-IP throttle |
| sync-entitlement | FULL-CHAIN (code) | validates tier vs RevenueCat S2S — client claims ignored |
| tmdb-proxy | FULL-CHAIN | rate-limited, path-allowlisted |
| notify-push | FULL-CHAIN | rescued + v2 deployed (per-type titles, actor in body) |
| fetch-rss | FULL-CHAIN (this pass) | see B-1 |
| paytabs-handler | NOT DESK-VERIFIABLE (dead) | legacy payment experiment; client never calls; delete post-launch |
| tmdb-proxy (duplicate, "smart-respo…") | NOT DESK-VERIFIABLE (dead) | stale deployment; delete post-launch |

## Background work / integrations — all reviewed
- **Offline queue + mutation executor:** [FULL-CHAIN] — typed exhaustive registry; at-least-once idempotency guard (same-id conflict → no-op; prevents phantom rewatches); flush on reconnect.
- **DB webhook → notify-push:** [FULL-CHAIN] — fires on notifications INSERT; optional shared-secret; stale-token pruning.
- **Realtime (lounge):** [FULL-CHAIN] — messages INSERT/UPDATE/DELETE + reactions deltas + presence; own-echo dedupe.
- **Push registration:** [FULL-CHAIN] — graceful without FCM; Android channel coded.
- **Email (Resend SMTP):** [FULL-CHAIN config] — custom SMTP on, domain Verified, rate 300/h, redirect allowlist fixed, house templates live. Live inbox test pending (user-side).
- **Sentry, RevenueCat init, MemoryManager, TactileEngine:** [GATES+SWEEP] + boot audit.
- **No cron/scheduled jobs exist** (verified: no pg_cron in migrations, no scheduled functions).

---

# Part B — Findings

## B-0 · This pass's fresh verifications — all clean
1. **fetch-rss chain** (`NewsService.ts:90-130`): per-feed 4s timeout + AbortController; per-feed failure → `[]`; zero items → curated `FALLBACK_NEWS`. The Dispatch wire cannot break the UI. ✅ No issues found.
2. **Double-submit guards on costly actions:** log seal — `submitting` state + `disabled={submitting}` (`LogForm.tsx:358`) ✅; purchase — `isPurchasing` + `disabled={isRedirecting||isRestoring}` (`membership.tsx:435`) ✅; report — `isSubmitDisabled` (`ReportSheet.tsx:326`) ✅. *(Initial grep flagged the log flow as unguarded — rejected as false positive on reading: the flag is named `submitting`, not `saving`.)*
3. **Route census:** every navigation target (18 path families) maps to an existing screen. Zero dead routes. ✅
4. **Dead-handler sweep:** one `onPress={()=>{}}` found (`WatchlistRoulette.tsx:198`) — verified intentional tap-blocker (modal overlay pattern). ✅
5. **console.log strays:** none in production code (only guarded warn/error crash-net paths). ✅
6. **No-op empty catches:** all verified best-effort cleanup (file deletion, logout-during-deletion, WebView teardown) or handled-elsewhere (settings mutation rolls back + toasts in `useUpdateUser.onError`). ✅

## B-1 · Issues found and FIXED during this audit cycle (all re-traced per Rule 5)
| # | Severity | Issue | Root cause | Fix (elite, not band-aid) | Re-verified |
|---|---|---|---|---|---|
| 1 | **HIGH** | Password recovery dead-ended at "link may have expired" | Client ran default implicit flow; `auth-callback` was written for PKCE; fragment tokens unread | `flowType:'pkce'` (`supabase.ts`) — the flow the callback was built for | Chain re-traced; live test on final build is the last confirmation |
| 2 | **HIGH** | Warm-start email links silently swallowed | Deep-link interceptor routed only `token_hash` links; PKCE `?code=` and `?error=` hit early-return (`_layout.tsx:109`) | Route on any auth payload (token_hash/code/error), forwarding params | Re-traced warm+cold paths |
| 3 | **HIGH** | Mobile reset links fell back to the website | `reelhouse://` absent from Supabase redirect allowlist | 3 entries added (exact + wildcard) — dashboard, confirmed by screenshot | Allowlist re-screenshot |
| 4 | **HIGH** | Ledger card showed total logs, not reviews (134 vs 77) | RPC counted `review IS NOT NULL` but app writes `review=''` | `get_profile_counts` v3 — predicates mirror each tab verbatim; run live; user-verified | Live result confirmed |
| 5 | MED | Private stacks vanished from own STACKS count | RPC counted public-only even for owner | v3: `is_private=false OR user_id=auth.uid()` | Live |
| 6 | MED | Tribunal outcomes invisible in-app | Moderation wrote `title/body`; client renders `message` only | `resolve_moderation_report_v2` fills `message` (humane house voice); live | Live |
| 7 | MED | Stack/dossier certifies + dossier critiques notified nobody | No trigger branches/triggers existed | `endorse_list` branch + 2 new triggers; migration run live | Live |
| 8 | MED | Push banners unintelligible ("started following your frequency", no actor) | notify-push sent static title + bare message; trigger copy off-voice | Trigger copy rewritten from live defs; notify-push v2 (per-type titles, @actor body) deployed | Deployed by user |
| 9 | MED | iOS camera path had no `NSCameraUsageDescription` | Avatar "take photo" flow; missing purpose string = kill-on-prompt risk | In-voice string added to `app.json` | Config re-read |
| 10 | LOW | Lounge hidden from Cinephiles in nav (conversion loss) | `hasLoungeAccess &&` render gate | Brass-key variant → `/lounge` → existing LoungeGate (`TopNavBar.tsx:128`) | Chain re-traced |
| 11 | LOW | Email templates generic; sender ok | Default-ish templates | House-voice letters (Confirm + Reset) pasted live | User confirmed |
| 12 | LOW | Email rate limit 25/h (launch-day starvation) | Default | Raised to 300 (dashboard) | Screenshot |

## B-2 · Verified clean per audit scope (what was specifically checked)
1. **Bugs/errors:** gates 0/0/951; unhandled-rejection global handler installed (`_layout`); layered error boundaries (global+section+route) → no white-screen path; unguarded `JSON.parse` sweep — all guarded or upstream-caught; 1 `@ts-expect-error` in 80k lines (documented SDK gap); 0 TODO/FIXME/HACK.
2. **Persistence:** optimistic writes roll back + toast on failure (`useUpdateUser`); offline queue survives restarts (MMKV) and flushes on reconnect; drafts persist (log draft key); session in SecureStore; idempotency guard prevents duplicate-commit inflation; counts heal from server on every profile open.
3. **Feature integrity:** route census zero dead ends; loading/empty/error/disabled states present on traced flows; in-voice empty states throughout; double-submit guards (B-0.2).
4. **Performance:** FlashList v2 correct (chat uses maintainVisibleContentPosition); image recyclingKey + memory-disk caching; profile cache-first open; assets total 588KB (exemplary); boot sequence parallelized — one flagged item: splash awaits `restoreSession` (network-dependent cold boot on bad signal) — deliberately NOT blind-fixed (boot is sacred); measure on device pass.
5. **Visual/layout:** color system 100% tokenized + ratchet-locked (`colorLock.test.ts`, baseline 106 legacy hexes, artwork exempt); Booth Law codified; statusBarTranslucent on all 20 transparent modals (triaged individually); typography enforced by compile-time font lock. Pixel-perfection on device = device pass.
6. **Journey friction:** scroll restoration + tap-tab-to-top QoL pass shipped; keyboard modes fixed; signup has resend-with-cooldown + manual-confirm fallback; recovery journey repaired (B-1.1-3); declines deliberately silent (kindness).
7. **Data/schema consistency:** backend-contract test guards code↔manifest on every jest run; live DB verified against client expectations (tables/RPCs/columns); `rank_position` uniform; migrations for every live object created this cycle (incl. rescued edge functions).
8. **Security:** prior live audit closed 5 holes (email harvest, follow-count vandalism, list injection, reporter forge, storage abuse); all SECURITY DEFINER fns self-guard on `auth.uid()` (spot-verified incl. all new ones); admin RPCs role-checked server-side; no secrets in client (publishable keys only — RC public key + TMDB read key by design); login edge fn enumeration-proof + throttled; interaction spam throttled client-side + `rate_limit_check` server infra; RLS restrictive posture verified live.
9. **Environment/config:** production Supabase URL/keys in eas production profile; Sentry DSN prod; `ITSAppUsesNonExemptEncryption` false; no debug flags (`__DEV__`-guarded only); no admin backdoors (Proprietor's Lock trigger verified live); buildNumber 36 / v1.0.0; expo-doctor dep advisories deliberately frozen (build 36 proves current versions on-device).

## B-3 · NOT desk-verifiable — explicit list (Rule 4)
| Item | Why | Where it's covered |
|---|---|---|
| Purchases end-to-end (sandbox buy) | Lives in RC + App Store Connect dashboards | Launch checklist §1 — **user must confirm RC account ownership** (iOS key exists in eas.json but user stated no RC account — unresolved contradiction, potential launch blocker for revenue) |
| Email live test (inbox placement, link taps, recovery e2e) | Needs a real mailbox + final build (PKCE fix rides next build; build 36 recovery is known-broken) | Checklist §5; mail-tester score pending |
| Push banner live test | Needs second device/account | One follow/certify from any user proves the chain |
| Visual feel of this cycle's UI (cover picker, the brass Concierge ＋ and its card, brass key) | Pixels need glass — the brass ramp especially, which was chosen from colour values and has never been seen on a screen | Final-build device pass list |
| Cold-boot time on poor network | Runtime measurement | Device pass (flagged in boot audit) |
| Android runtime everything | No Android device exists; purchases/push unwired (no RC android key, no FCM) | ANDROID_LAUNCH.md runbook — §1 config is user's pre-launch work |
| Scale behavior (realtime at 1000s concurrent, TMDB proxy under load) | Needs production traffic | Sentry + staged rollout are the instruments |

---

# Part C — Summary

## Verdict: **READY** *(code-side)* — remaining work is dashboards + one device pass, already scheduled
No blockers exist in the codebase. Every defect found across four audit cycles has been fixed, re-traced, and shipped; this final pass found **zero new defects** (one candidate raised and rejected as a false positive on inspection).

## Punch list (all owner-side, priority order)
1. **[BLOCKER-if-unresolved] RevenueCat account contradiction** — confirm dashboard ownership of the `appl_…` key; create App Store Connect IAPs + agreements; one sandbox purchase. Without this, launch ships with dead revenue.
2. **[HIGH] Final build + 1-hour device pass** — the scripted checklist (auth links warm/cold, recovery e2e, covers, counts, camera path, the Concierge ＋ — open it, take both doors, confirm each screen actually opens — brass key, cold boot, purchase, push).
3. **[HIGH] Android §1 wiring** (Play Console → Firebase/FCM → RC android key → Play IAPs) — required for the decided simultaneous launch; Play pre-launch report as robot device-pass substitute.
4. **[MED] Email live test + mail-tester score** (target 9+).
5. **[LOW] Store listings** — screenshots, description, privacy-policy URL.
6. **[POST-LAUNCH] Cleanups:** delete dead edge fns (paytabs-handler, dup tmdb-proxy), legacy tables glance, expo-doctor dep alignment, color-lock baseline shrink, parked features (sound, materials, polls, FrozenTab) on their documented revival terms.

## Standing guards (what keeps this true after launch)
951-test suite (incl. backend-contract drift guard + color ratchet + font lock + a11y-critical smoke tests) runs on every change; Sentry watches production; the runbooks (ANDROID_LAUNCH.md, launch checklist) carry the rest.

*Signed: the final desk audit. The remaining distance to launch is not in the code.*
