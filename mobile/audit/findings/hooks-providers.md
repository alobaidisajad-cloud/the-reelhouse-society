# Findings — `src/hooks/*` and `src/providers/*`

All 30 hooks + 3 providers read in full.

Overall: **elite.** This tier is a showcase of correct React concurrency: `useReducer` batching (useProfileData), AbortController-on-rerun + `isMounted` + cross-user-id guards on every async dispatch (useProfileData, useProfileController), request-id race guards (useAuthFlow username check), per-target mutexes, optimistic+rollback with shared delta functions that can't drift (useProfileController `computeFollowCountDelta`), reduce-motion-aware animations, timezone/DST-safe streak math, triple-guarded analytics. One MEDIUM finding (a moderation-routing divergence); everything else is clean.

---

## MEDIUM

### HOOK-1 (MEDIUM) — Home-feed "report" writes to a different table than the moderation system reads
**Files:** `src/hooks/useReportUser.ts:15` (writes `user_reports`), used by `src/components/home/PulseCardItem.tsx:77`; vs `src/services/ModerationService.ts:4-17` + `src/stores/reportStore.ts` (the Tribunal reads/writes `reports` via `submit_report` RPC).

The app has **two parallel report systems**:
- The full Society moderation flow (`ReportSheet` → `reportStore.submitReport` → `submit_report` RPC → `reports` table; the Tribunal admin screen reads `reports` via `ModerationService.getPendingReports`).
- A simpler legacy quick-report on home-feed pulse cards (`useReportUser` → direct insert into `user_reports`).

Reports filed from the home feed land in `user_reports`, which the Tribunal never queries. Unless a DB trigger/view mirrors `user_reports` → `reports`, those reports are silently invisible to moderators.
**Why it matters:** a moderation action a user believes they performed may never reach a moderator — a trust/safety gap.
**Fix:** Route `PulseCardItem`'s report through the same `reportStore`/`submit_report` path as `ReportSheet` (with the proper `content_type`/`target_user_id`), or confirm a server-side unification of the two tables. Needs server verification of whether `user_reports` is surfaced anywhere.

---

## LOW

### HOOK-2 (LOW) — `AccessibilityProvider` monkey-patches RN `Text.render`/`TextInput.render`
**File:** `src/providers/AccessibilityProvider.ts:20-41`
Patches React Native internals (`(Text as any).render`) at import time to inject global Dynamic Type props. It's guarded with a `defaultProps` fallback and spreads `{...scaledTextProps, ...props}` so per-component props win — defensible — but reaching into RN's forwardRef internals is fragile across RN upgrades (could silently no-op or break on a future RN version).
**Fix:** Acceptable as-is given the fallback; add a comment pinning the RN version this was verified against, and a smoke test, so an upgrade surfaces breakage.

### SCHEMA-4 addendum (LOW) — `EditProfileSchema` export is dead; `useEditProfile` redefines it inline (drops the `max(10)` links cap)
**Files:** `src/schemas/profile.ts:20-28` (exported `EditProfileSchema`, doc says "Used by: useEditProfile hook") vs `src/hooks/useEditProfile.ts:15-20` (inline `editProfileSchema`).
The documented consumer doesn't import the exported schema — it redefines its own copy, which omits the `links.max(10)` cap. So the exported schema is dead code and the "max 10 links" rule isn't enforced by the active form schema. (Folds into SCHEMA-4.)
**Fix:** Import `EditProfileSchema` from `schemas/profile.ts` in `useEditProfile` (single source of truth), restoring the 10-link cap.

---

## Confirmed elite (no action)
- `useProfileData` — `useReducer` over 22 fields, AbortController abort-on-rerun, `isMounted` + `targetUserIdRef` guards on every async dispatch, client privacy + tier gates, RESET_STATE on user switch, append dedup, deep-equality filter guard, MMKV-instant + background refresh for self.
- `useProfileController` — drift-free optimistic follow via shared `computeFollowCountDelta`, id-guarded rollback against profile-swipe bleed, explicit-property hash (avoids JSON key-order render loops), ref-indirected `loadTabData` to break render loops, deep-link array guard.
- `useEntitlement` — RC canonical once loaded (MMKV edits can't grant *permanent* premium), highest-watermark only during loading, post-purchase session-refresh polling, graceful "No package found" copy.
- `useEditProfile` — validateUsername at submit, comprehensive optimistic avatar propagation across feed/lounge/search/critique caches, legacy-avatar purge (schema nit above aside).
- `useAuthFlow` — request-id race guard, credentials cleared from memory after use, throttle integration, resend cooldown.
- `useLogFlow` — pure testable `buildLogPayload` with tier-gated field stripping, debounced draft save with scalar deps, reset-first edit population.
- `useUniversalSearch` — `escapeSearchPattern` on every `.or()` filter, `Promise.allSettled`, block-filtering all result types.
- `useFeeds` — compound-cursor infinite query + block-filter select.
- `useSafeAsync`, `useStableSubscription`, `useDebouncedSearch`, `useStaggeredPrefetch` — unmount-safe async, abort, cleanup, batching.
- `useAuthThrottle` (MMKV-persisted brute-force limiter), `useBanCheck`, `useOfflineAware`, `useAnalytics` (triple-guarded), `useStreak` (DST-safe), `useDeviceThrottling`, `useReducedMotion`, animation hooks (reduce-motion aware).
- `AppBootstrapper` — subscription-based idempotent boot, deep-link allowlist validation, SDK-failure-tolerant, `SIGNED_OUT`→logout, global unhandled-rejection→Sentry.
- `FilmDetailProvider`, `useFilmDetail`, `useFilmReviews`, `useTMDBMovies`, `useLoungeData`, `useUpdateUser` (role-stripped by service).
