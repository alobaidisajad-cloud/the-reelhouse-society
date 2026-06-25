# Findings — `app/` screens (IN PROGRESS)

Line-level read of Expo Router screens. The earlier pattern sweep already cleared injection/WebView/direct-write/FlashList classes across all screens; this pass traces per-screen logic (queries, mutations, auth/privacy gating, writes).

## Read so far
- `app/(admin)/tribunal.tsx` (1181) — admin moderation console.
- `app/(admin)/_layout.tsx` — RBAC redirect guard (read earlier; `role!=='admin'` → Redirect).
- `app/user/[username].tsx` (934) — profile viewing, privacy/follow/block.

### user/[username].tsx — privacy gate correctly layered (clean)
`isPrivate = is_social_private && !isSelf && !isFollowing` (`:209`). Content tabs render only behind `!isPrivate` (`:853`); private placeholder at `:802`; follower/following stat taps disabled when private (`:796-797`). Crucially the **fetch is also privacy-gated** — `useProfileController` passes `is_social_private` into `useProfileData` (`useProfileController.ts:102`), so a non-follower doesn't even fetch the private user's logs/vault/lists (not just hidden in render). Layered with server RLS (verify in backend gate). Block state via `useBlockStore.isBlocked` (`:167`). Follow/unfollow optimistic with `computeFollowCountDelta` (request→0 delta for private). No client privacy leak.

---

## CHECKPOINTS / FINDINGS

### SCREEN-TRIBUNAL-1 (verify server-side, not a client bug) — moderation enforcement passes client-supplied `admin_id`
**File:** `app/(admin)/tribunal.tsx:357-362,379` → `ModerationService.resolveReportV2(reportId, action, { admin_id: user!.id, ... })` and `ModerationService.bulkDismiss(reportIds, user!.id, ...)`.
**Client posture is correct (triple defense-in-depth):** `(admin)/_layout.tsx` redirects non-admins; both queries are `enabled: role==='admin'`; the screen early-returns an empty View if `role!=='admin'`. So a non-admin cannot reach the UI normally.
**The real dependency:** every enforcement RPC (`resolve_report_v2`, `bulk_dismiss`, `get_pending_reports`, `get_priority_queue`, `get_user_moderation_history`) **must verify the caller's `auth.uid()` role server-side** and must NOT trust the `admin_id`/`p_admin_id` parameter. If any of these RPCs derives the actor from the passed param instead of `auth.uid()`, a non-admin could call them directly (bypassing the client) and forge `admin_id`. **Action: confirm when reading `supabase/migrations/*` — esp. `20260622_rpc_auth_hardening.sql` and the trust-and-safety engine migration — that these RPCs gate on `auth.uid()` role.** This is part of PLAN's "server verification gate".

## Confirmed clean (client-side)
- **tribunal.tsx** — React Query w/ admin-gated `enabled`, cursor pagination (priority queue), multi-select bulk dismiss, confirmation Alerts for ban/permanent_exile, suspend-duration validation (positive int), enforcement-history panel. Defensive array-or-object shape handling on `reporter`/`target_user` joins. No client logic bug.
