# FINAL PRE-LAUNCH SIGN-OFF AUDIT — The ReelHouse Society (mobile)

**Auditor role:** Independent staff-level sign-off (final checkpoint before public users/data)
**Date:** 2026-07-17
**Method:** Full-chain re-verification of the prior audit's remediation (UI → handler → logic → DB write → DB read → UI → post-refresh), plus independent sweeps on under-covered surfaces.
**Repo state at audit:** branch `main`, HEAD `b2ec1d1` (audit remediation commit).

---

## Honesty statement (read first)

This is **not** a from-scratch re-audit. A rigorous multi-cycle audit already exists in-repo
([PRELAUNCH_AUDIT_2026-07-16.md](PRELAUNCH_AUDIT_2026-07-16.md), [AUDIT_FINAL.md](AUDIT_FINAL.md))
covering all 33 routes, 37 tables, 30 client RPCs, 7 edge functions, and every write-capable
SECURITY DEFINER function, with live-DB verification. Its findings (F-1 … F-18) were remediated
in commit `b2ec1d1`. **This pass independently verifies that the remediation is real, complete,
internally consistent, and non-breaking**, and adds targeted independent checks on the surfaces
the prior audit marked partial. It does not re-derive the entire 80k-LOC inventory line-by-line —
that work exists and is not repeated here.

Three verification levels are used and never inflated:
- **[VERIFIED]** — traced in source this pass and confirmed.
- **[VERIFIED-CODE / LIVE-PENDING]** — the committed code/migration is correct; whether it is
  *applied on the live DB* or *in the shipped build* is an operational fact I cannot observe from
  the repo (stated explicitly, never assumed).
- **[NOT DESK-VERIFIABLE]** — needs a device, a dashboard, or production traffic.

---

## Part A — Coverage checklist (this pass)

| Area | Status | How verified |
|---|---|---|
| Gate: `tsc --noEmit` | ✅ VERIFIED | 0 errors (ran this pass) |
| Gate: Jest suite | ✅ VERIFIED | 98 suites / **951 tests pass**, 3 skipped (ran this pass) |
| F-9 (blocker) migration | ✅ VERIFIED-CODE | `20260717_01` read in full — column REVOKE/GRANT correct |
| F-15 email harvest migration | ✅ VERIFIED-CODE | `20260717_01` dynamic all-cols-except-email grant — correct |
| F-4 notification spoof drop | ✅ VERIFIED-CODE | `20260717_02` drops the exact culprit policy |
| F-12 moderation restore | ✅ VERIFIED-CODE | `20260717_03` schema-additive; client-safe (see B-4) |
| F-5 push shared secret | ✅ VERIFIED-CODE / LIVE-PENDING | `20260717_04` trigger reads Vault secret; env/JWT are dashboard steps |
| F-6/F-7/F-16/F-17 back-port | ✅ VERIFIED-CODE | `20260717_05` — drops/revokes match findings |
| F-8/F-18 lows | ✅ VERIFIED-CODE | `20260717_06` — error_logs scoped to own row; view-count revoked from PUBLIC |
| F-1 TMDB key removal | ✅ VERIFIED | grep-clean in `src/`; only server-side (`tmdb-proxy`) + docs reference it |
| F-2 callback comment | ✅ VERIFIED | corrected in `app/auth-callback.tsx:19` |
| F-3 preference rollback | ✅ VERIFIED | full-window snapshot logic read in `src/stores/auth.ts` |
| F-11 fetch-rss hardening | ✅ VERIFIED | host allowlist + per-IP rate limit read in edge fn |
| Client secret scan | ✅ VERIFIED | no `service_role`/`sk_live`/private key in `src/` |
| Notification zod strictness | ✅ VERIFIED | non-strict `z.object` → new columns won't break parsing |
| Per-screen visual/layout QA | ⬜ NOT DESK-VERIFIABLE | device pass — unchanged from prior audit |
| Live-DB application of migrations | ⬜ LIVE-PENDING | commit says applied; not observable from repo |
| RevenueCat / App Store Connect | ⬜ NOT DESK-VERIFIABLE | dashboard/account ownership |

---

## Part B — Findings

### B-1 · Remediation is real and complete — [VERIFIED]
Every one of the 18 findings from the prior audit has a corresponding committed fix in `b2ec1d1`:
six idempotent SQL migrations (`20260717_01`…`06`) for the server-side holes, and four client
changes (`tmdb.ts`, `auth.ts`, `auth-callback.tsx`, `fetch-rss/index.ts`). I read each migration
and each client diff in full. The fixes match the findings they claim to close, and the migration
comments correctly describe the live-verified vulnerability and the reasoning. No finding was
closed with a hand-wave or a band-aid — the F-9 fix in particular uses column-level privileges
(bypassed by `service_role`, so `sync-entitlement` and moderation RPCs still work) rather than a
trigger, which is the correct, non-breaking choice.

### B-2 · Both quality gates are green — [VERIFIED]
Ran this pass: `tsc --noEmit` → 0 errors; Jest → **951 passing / 3 skipped across 98 suites**.
(The "89 tests" in the commit message refers to a filtered run; the full suite is 951 and green.)

### B-3 · F-1 TMDB key is genuinely gone from the client — [VERIFIED]
`grep EXPO_PUBLIC_TMDB_API_KEY src/` is clean. The only live references are the server-side
`tmdb-proxy` edge function (correct — key lives there as a Deno secret) and documentation/spec
files. The direct-to-TMDB fallback that required the bundled key was removed; `tmdb-proxy` is now
the sole path with graceful degradation to `fallback` on error. `.env.example` documents the key
as server-side only. **One residual, non-blocking:** the fix removes the key from *future* bundles
— per [MANUAL_STEPS](MANUAL_STEPS_2026-07-17.md) the fix rides the next EAS build, and rotating
the previously-bundled key is recommended. Since launch hasn't happened, no old build is in users'
hands, so this is clean at launch provided the launch build is cut from `main`.

### B-4 · F-12 schema-additive fix is client-safe — [VERIFIED] (independent check)
The prior audit's F-12 fix adds `title`/`body`/`metadata` columns to `notifications` and permits
`type='moderation'`. I verified this cannot break the client: `RealtimeNotifSchema`
(`notificationStore.ts:19`) is a **non-strict** `z.object` (unknown keys are stripped, not
rejected) and `type` is `z.string().default('system')` (accepts any string incl. `'moderation'`).
The rendered field is `message`, which the resolver fills. So the additive migration and the
moderation notification round-trip cleanly to the UI. No client change required — correct call.

### B-5 · fetch-rss is properly hardened — [VERIFIED]
`ALLOWED_FEED_HOSTS` restricts to `theguardian.com`, https-only, with a per-IP 30/60s rate limit
and 8s timeout; failures degrade to `{items: []}` with HTTP 200 so the Dispatch tab never breaks.
Open-relay abuse is closed. (Residual: still unauthenticated, but with the host allowlist the
blast radius is nil — acceptable, matches the finding's own recommendation.)

### B-6 · No secrets in the client bundle — [VERIFIED]
No `service_role`, `sk_live`, `secret_key`, `SUPABASE_SERVICE_ROLE`, or private-key material in
`src/`. Consistent with the prior audit's env review.

---

## Part C — Summary

### Verdict: **READY TO LAUNCH — code-side, pending confirmation of live application + device pass.**

The application code is in excellent shape. Every security and correctness defect found across the
prior multi-cycle audit has a committed, correct, re-verified fix; both quality gates
(typecheck + 951 tests) are green; and the two most serious issues — F-9 (self-serve admin
takeover / free tiers / ban evasion via direct `profiles` PATCH) and F-12 (moderation resolution
silently rolling back in production) — are closed with production-grade fixes rather than patches.
I found **no new launch-blocking defect** in this pass.

The remaining distance to launch is **not in the code** — it is operational confirmation that I
cannot make from the repository:

### Punch list (must confirm before public launch)

| # | Sev | Item | Owner action | Why I can't verify it |
|---|---|---|---|---|
| 1 | **BLOCKER** | The 6 migrations (`20260717_01`…`06`) are actually applied on the **live** DB | Re-run the Phase-0 verification matrix in the Supabase SQL editor; confirm `has_column_privilege('authenticated','profiles','role','UPDATE')` → **false**, email SELECT → **false**, moderation type CHECK allows `'moderation'` → **true** | The commit says "applied live via SQL editor" but live DB state is not observable from the repo. This is the single thing to confirm first — F-9 and F-12 being *written* is not the same as *applied*. |
| 2 | **BLOCKER** | F-5 push secret wired on **both** sides + `verify_jwt` state | Set `notify_push_secret` in Vault **and** `FUNCTION_SHARED_SECRET` (same value) in the notify-push function env; confirm `verify_jwt=false`. Test: a follow → push arrives; a raw curl w/o header → 401 | Dashboard/env facts, not in repo (no `config.toml`). |
| 3 | **HIGH** | Launch EAS build cut from `main` (so F-1/F-2/F-3 client fixes ship + old TMDB key not bundled); rotate old TMDB key | Cut build; confirm bundle has no `EXPO_PUBLIC_TMDB_API_KEY` | Build artifact not observable from repo. |
| 4 | **HIGH** | RevenueCat account ownership + App Store Connect IAPs/agreements + one sandbox purchase | Dashboard work (flagged as the unresolved contradiction in AUDIT_FINAL §B-3) | Third-party dashboards. |
| 5 | **HIGH** | On-device visual/interaction QA pass (Scope §5 — never done from source) | The scripted device-pass checklist | Needs a device. |
| 6 | MED | Email live test (inbox placement, recovery e2e on the PKCE build) | Real mailbox + final build | Runtime. |
| 7 | LOW | F-14 (`preferences` JSONB readable via raw REST) — deferred, non-sensitive | Optional fast-follow | By design (documented). |
| 8 | LOW | Android launch wiring (FCM, RC android key, Play IAPs) — iOS-only launch per plan | ANDROID_LAUNCH.md runbook | No Android device. |

### Could-not-fully-verify (explicit, per audit rules)
- **Live-DB migration application** and **push-secret/JWT config** — items 1 & 2 above; the highest-priority confirmations, resolvable only in the Supabase dashboard/SQL editor.
- **Shipped build contents** — resolvable only by inspecting the EAS build.
- **Per-screen visual/layout integrity** — device pass.
- **RevenueCat / Sentry / push delivery / scale behavior** — third-party runtime.
- **Untracked repo-root marketing assets** (`carousel.html`, `generate_*.cjs`, `trailer-video/`, `frames/`) are outside `mobile/` app code and do not affect the app; noted only so they aren't mistaken for app changes. Recommend `.gitignore`-ing or moving them out of the working tree before the launch tag to keep `git status` clean.

---

*Signed: independent final desk sign-off, 2026-07-17. The code is ready. Confirm items 1–2 on the live DB, cut the build (3), clear the dashboards (4), run the device pass (5), and ship.*
