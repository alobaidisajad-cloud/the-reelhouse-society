# Execution Status — remediation of the 51 findings

> What I executed (committed + verified), what remains and why, and exactly what YOU must do manually.
> Branch: `fix/log-form-core-fields`. Verification gate for every code commit: `tsc` clean · `eslint` clean · 899/899 Jest tests green.

---

## ✅ DONE — committed & verified this push

### Backend migrations (idempotent; written, NOT yet deployed — see Manual Step 2)
| Finding | Migration | What it does |
|---|---|---|
| NOTIF-SPOOF-1 (HIGH) | `20260626_01_notification_security.sql` | drops the typo'd-name permissive notifications INSERT policy by its real name + explicit deny |
| NOTIF-DUP-1 (MED) | `20260626_01` | drops the duplicate `tr_notify_interaction` trigger |
| PROFILE-FREEZE-1 (HIGH) | `20260626_02_profile_freeze_fix.sql` | stops protecting derived counters (unfreezes follower counts); guards role/tier reverts on `auth.role()='authenticated'`; same for video metrics |
| PRIV-1 (MED) | `20260626_03_privacy_and_rate_limit.sql` | adds `can_view_user_data` gate to `get_public_profile_analytics` + STABLE/search_path |
| RL-1 (LOW) | `20260626_03` | `SET search_path` on `rate_limit_check` |
| SHADOWBAN-1 | `20260626_04_remove_dormant_shadowban.sql` | drops the unreviewed trust_score deduction trigger + the dead shadowban SELECT policy |

### Edge functions (written, NOT yet deployed — see Manual Step 3)
| Finding | File | Fix |
|---|---|---|
| PAY-1 (HIGH) | `paytabs-handler` | removed `'dev-secret-123'` fallback (fail closed) + length-safe token compare |
| PAY-2 (MED) | `paytabs-handler` | writes role+tier; routes founding via atomic `claim_founding_seat` |
| EMAIL-2 (LOW) | `send-email` | bounds the rate-limit Map |
| PULSE-1 (LOW) | `social-pulse` | deleted (dead service-role fn that would leak private reviews) |

### Client code (live in the app once merged/built)
COMP-1 (sanitize choke point in LogService/StackService) · HOOK-1 (reports → Tribunal via reportStore) · SVC-1 (removed broken offline notif insert; trigger is the source) · SVC-3 (shared decoder) · UTIL-1 (0ms yield, not 100ms×N) · UTIL-3 (timeAgo year) · UTIL-4 (no false "username taken") · STORE-1 (web logout clears storage) · NOTIF-1 (per-row salvage) · TYPES-2 (shared report enums) · CONST-2 (barrel completeness) · LIB-3/LIB-4 (doc accuracy) · COMP-2 (TrailerModal whitelist scoped) · COMP-FEED-DEAD-1 (deleted dead file).

### Previously fixed (earlier in engagement)
COMP-LOG-1, TYPES-1, LIB-1, LIB-2, OFFQ-1 (all tested) · FOUND-1 (resolved in code).

**≈ 31 of 51 findings fully executed.**

---

## ⏳ REMAINING — deferred *on purpose*, with the reason and the exact fix

> These were NOT auto-applied because each carries real regression risk, needs a product decision, or needs device/coordination — doing them blind would violate "flawless." Each has a precise plan.

### A. Needs a careful multi-file change + targeted test
- **COMP-1-orig (preference double-write):** must FIRST migrate every preference-write caller (ProfileTriptych, ProgrammesSection, SettingsScreen, `auth.updateUser({preferences})`) to `auth.setPreference`/`update_my_preferences`, THEN remove `preferences` from `ProfileWriteService.updateProfile` (`:52`). Removing it first would silently stop persisting prefs for any caller still on the overwrite path.
- **STORE-2 (restoreSession self-correct):** in `auth.ts` restoreSession, on the no-session branch (`:124`) explicitly `set({ user: null, isAuthenticated: false })` instead of relying on the global listener. Verify it doesn't fight the optimistic-cache startup.
- **FEAT-1/FEAT-2 (import safety):** run imported review/notes through `sanitizeInput` in `archiveImport.ts`; add a decompressed-size + entry-count cap around `JSZip.loadAsync`. Test with a real export ZIP.
- **UTIL-2 (abort vs timeout):** Hermes uses `AbortError` for both timeouts and external aborts — add an explicit sentinel on the external AbortController so `withTimeout` can tell them apart.

### B. Type-tightening that cascades (do with tsc in a loop)
- **TYPES-4:** delete `react-native-purchases.d.ts`; type `Purchases` as `typeof import('react-native-purchases').default` — then fix every tsc error it surfaces in the payments layer (that's the point).
- **TYPES-3 / SCHEMA-3:** replace `autopsy: any` / `z.any()` with a concrete autopsy shape (or `z.unknown()` + guards); update consumers (AutopsyView/AutopsyGauge).
- **SCHEMA-2:** enum the persisted privacy fields in `user.ts` — but first confirm no legacy stored value violates the enum (else parse drops them). 
- **SCHEMA-1 / SCHEMA-4 / SCHEMA-4b / LIB-5:** tighten EditProfile regex to match `validateUsername`; converge the two profile schema files; derive `DomainLogSchema` from the type; share one TMDB-id coercer. Pure cleanups, low risk, just touch consumers.

### C. UI work — needs device verification
- **COMP-SPOILER-1:** add blur + tap-to-reveal in `LogReviewBody`; thread `is_spoiler` into `feed.schema` + `ReviewContent` + `FilmReviews`. Visual — verify on device.

### D. Backend that touches client flows / needs config or product intent
- **LOUNGE-1:** add SECURITY DEFINER `find_lounge_by_invite(p_code)` + switch the client invite-join to it + drop the broad "Invite code lookup" policy. (Confirm the client invite flow first.)
- **EMAIL-ENUM-1:** rework to a single `sign_in_with_username` server step that never returns the email, OR add per-IP rate-limiting. Product decision (or move to email-only login).
- **signup-collision:** add a uniqueness-safe suffix in `handle_new_user`'s email-prefix fallback — but it has multiple historical definitions; reconcile to one current version first.
- **EMAIL-1 / PUSH-1:** require a shared-secret/JWT on the `send-email` / `notify-push` webhook entrypoints (needs the Supabase DB-webhook secret configured).
- **TMDB-1:** add an anon-key/JWT check or per-IP throttle to `tmdb-proxy`.
- **SANITIZE-1:** COMP-1 now gives client-layer consistency; for true server-side enforcement add a BEFORE-INSERT sanitize trigger on comment tables, and delete the dead `sanitize-input` edge fn.
- **TIP-1:** only if the projectionist/tips/showtimes features ship — then payment-confirmed service-role tip path + booking ownership.

### E. Cosmetic / low-value — left as-is intentionally
- **CONST-1** (sepia variants differ from base — may be intentional design; change is purely visual), **CONST-3** (source prices from RC offerings — UX/integration call), **HOOK-2** (Text.render patch works; fragile only on RN upgrade), **OFFQ-2** (dead `_queueUserId`; removing touches the auth-store contract + a test for zero behavior change).

---

## 🔴 WHAT YOU MUST DO MANUALLY (in order)

1. **WAVE 0 — verify live DB FIRST (most important).** In the Supabase SQL editor, dump the live definitions and compare to the migrations (the queries are in `MASTER_PLAN.md` → WAVE 0). This tells you whether PROFILE-FREEZE-1 / SHADOWBAN-1 / NOTIF-SPOOF-1 are *live* (then my migrations fix them) or were hand-patched (then the migrations just realign the repo). **If PROFILE-FREEZE-1 is live, premium upgrades + follower counts are currently broken — this is the #1 thing to confirm.**
2. **Deploy the migrations:** `supabase db push` (applies `20260626_01..04`). They're idempotent — safe to re-run. Take a DB snapshot first.
3. **Deploy the edge functions:** `supabase functions deploy paytabs-handler` and `supabase functions deploy send-email`; remove the deleted `social-pulse` function from the project.
4. **Set environment variables:** `PAYTABS_WEBHOOK_SECRET` (the webhook now **fails closed** without it) and `REVENUECAT_SECRET_KEY` (needed by `sync-entitlement` for FOUND-1). Confirm `RESEND_API_KEY`, `TMDB_API_KEY`, VAPID keys are set.
5. **RevenueCat dashboard (LIB-1):** confirm the products exist with ids the resolver matches (`archivist_annual`, `auteur_annual`, `founding_lifetime`, …). Without products configured, purchases still can't complete.
6. **Device-verify the fixed flows:** log a film (COMP-LOG-1), lounge chat ordering (TYPES-1), a real purchase upgrading tier + unlocking premium (after migration 02 deploys), following a user incrementing the count (proves PROFILE-FREEZE-1 fixed), report-from-pulse-card reaching the Tribunal (HOOK-1).
7. **Stand up the integration test backbone** (strongly recommended): a Supabase-branch CI job exercising triggers/RLS — a "follow → count++ / non-admin can't insert a notification / private user's logs invisible to non-follower" suite. This permanently locks the HIGH findings closed (Jest with mocked Supabase can't).
8. **Branch/PR hygiene:** this work sits on `fix/log-form-core-fields`. Consider splitting into reviewable PRs (client fixes / backend migrations / edge functions) before merge.

---

## Suggested order to finish the remaining ~20
B (type cleanups, tsc-driven) → A (the careful multi-file ones, each with a test) → C (spoiler UI, with device pass) → D (backend that needs config/decisions) → E (skip or batch trivially). I can execute any of these on request — just say which group.
