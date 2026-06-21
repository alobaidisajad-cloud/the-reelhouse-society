# Implementation Plan: Path to 100/100

## Overview

Six surgical fixes to close remaining quality gaps. Fixes 1–5 are independent single-file changes; Fix 6 (verification tests) depends on all prior fixes being complete. TypeScript throughout, leveraging existing patterns (Sentry, MMKV, Zustand, Jest + fast-check, Maestro).

## Tasks

- [ ] 1. TMDB Proxy Migration
  - [ ] 1.1 Rewire `fetchTMDB` to POST through proxy
    - In `src/lib/tmdb.ts`, remove `TMDB_API_KEY` and `TMDB_BASE` constants
    - Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `PROXY_URL` constants derived from existing env vars
    - Replace the direct URL construction inside `fetchTMDB` with a POST to `PROXY_URL` including `{ path }` body, `apikey` header, and `Authorization: Bearer` header
    - Preserve all existing behavior: LRU cache, inflight dedup, 3-attempt retry on 429/503, 10s abort timeout, fallback return on non-retryable errors
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 1.2 Update `.env.example`
    - Remove the `EXPO_PUBLIC_TMDB_API_KEY` entry from `.env.example`
    - Add a comment noting TMDB key is now server-side only
    - _Requirements: 1.6_

  - [ ]* 1.3 Write property test for proxy request construction
    - **Property 1: Proxy request construction**
    - For any valid TMDB path string, the outgoing request SHALL be a POST to the proxy URL with body `{ "path": "<path>" }` and correct auth headers
    - Use fast-check string arbitrary filtered to valid TMDB path patterns
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 1.4 Write property test for retry and fallback behavior
    - **Property 2: Retry and cache preservation**
    - For any path, if proxy returns 429 or 503, `fetchTMDB` retries up to 3 attempts
    - **Property 3: Non-retryable error returns fallback**
    - For any HTTP error status that is not 429/503, `fetchTMDB` returns fallback without retrying
    - **Validates: Requirements 1.4, 1.5**

- [ ] 2. Bounded Fallback Queries
  - [ ] 2.1 Reduce `.limit()` values in Strategy 2 fallback
    - In `src/services/FeedService.ts`, locate the Strategy 2 direct-query `Promise.all` block
    - Change `list_items` sub-query from `.limit(10000)` to `.limit(600)`
    - Change `interactions` sub-query from `.limit(10000)` to `.limit(3000)`
    - _Requirements: 2.1, 2.2_

  - [ ]* 2.2 Write property test for query bounds
    - **Property 4: Strategy 2 query bounds**
    - For any execution of the Strategy 2 path, `list_items` limit is 600 and `interactions` limit is 3000
    - Mock Supabase query builder chain, assert `.limit()` called with correct values
    - **Validates: Requirements 2.1, 2.2**

- [ ] 3. Preference Sync Durability
  - [ ] 3.1 Add dirty flag to `setPreference`
    - In `src/stores/auth.ts`, after the optimistic MMKV cache write in `setPreference`, add `storage.set(`dirty_prefs_${user.id}`, 'true')`
    - In the debounced sync success path, add `storage.delete(`dirty_prefs_${user.id}`)`
    - In the debounced sync failure path, ensure dirty flag remains set (no deletion)
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 3.2 Add dirty-prefs reconciliation to `restoreSession`
    - In `src/stores/auth.ts`, after `getSession()` succeeds, check `storage.getString(`dirty_prefs_${session.user.id}`) === 'true'`
    - If dirty, parse cached user prefs and push them to `profiles` table before loading server profile
    - On successful push, delete the dirty flag
    - On failed push, preserve local prefs and do not overwrite with server data
    - _Requirements: 3.4, 3.5, 3.6_

  - [ ]* 3.3 Write property test for dirty flag lifecycle
    - **Property 5: Dirty flag set on preference write**
    - For any preference write, `dirty_prefs_{userId}` is `'true'` immediately after write
    - **Property 6: Dirty flag reflects sync outcome**
    - If sync succeeds, flag is cleared; if sync fails, flag remains
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 3.4 Write property test for session restore reconciliation
    - **Property 7: Session restore reconciles dirty preferences**
    - For any session restore where dirty flag is set, local prefs are pushed before server load
    - If push succeeds, flag is cleared; if push fails, local prefs are preserved
    - **Validates: Requirements 3.4, 3.5, 3.6**

- [ ] 4. Boot Observability Breadcrumbs
  - [ ] 4.1 Add `addBreadcrumb` calls and `Sentry.setTag` to boot sequence
    - In `src/providers/AppBootstrapper.tsx`, import `addBreadcrumb` and `Sentry` from `../lib/sentry`
    - After `setSentryUser()` call, add `addBreadcrumb('Sentry user context initialized', 'boot')`
    - After `identifyRevenueCatUser()` call, add `addBreadcrumb('RevenueCat initialized', 'boot')`
    - After `registerForPushNotifications()` call, add `addBreadcrumb('Push notifications registered', 'boot')`
    - After notification service `setupRealtime()` call, add `addBreadcrumb('Notification service setup', 'boot')`
    - After `hydrateFollowing()` call, add `addBreadcrumb('Background hydration started', 'boot')`
    - At the end of the boot try block (before catch), add `Sentry.setTag('boot_complete', 'true')`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 5. Remove react-native-web
  - [ ] 5.1 Remove dependency and web script from `package.json`
    - Remove `"react-native-web": "^0.21.0"` from `dependencies`
    - Remove `"web": "expo start --web"` from `scripts`
    - _Requirements: 5.1, 5.2_

- [ ] 6. Checkpoint — Fixes 1–5 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npx tsc --noEmit` to verify no type errors
  - Run `npx jest --run` to verify existing tests still pass

- [ ] 7. Boot Verification Tests
  - [ ] 7.1 Create structural unit test for boot
    - Create `app/__tests__/boot-structure.test.tsx`
    - Mock all external dependencies (supabase, revenueCat, pushNotifications, sentry) to avoid network calls
    - Assert `AppBootstrapper` is rendered as a child within the Root Layout component tree using `@testing-library/react-native`
    - Test SHALL pass without requiring network access or real credentials
    - _Requirements: 6.1, 6.3_

  - [ ] 7.2 Create Maestro E2E boot verification flow
    - Create `.maestro/boot_verification.yaml`
    - Configure `appId: com.reelhouse.mobile`
    - Add `launchApp` step followed by `assertVisible` for `id: "feed-screen"` with `timeout: 15000`
    - Verifies that the app completes boot and reaches the feed/lobby screen
    - _Requirements: 6.2, 6.4_

- [ ] 8. Final Checkpoint — All 6 fixes verified
  - Ensure all tests pass, ask the user if questions arise.
  - Run `npx tsc --noEmit`
  - Run `npx jest --run`
  - Confirm `EXPO_PUBLIC_TMDB_API_KEY` does not appear in `src/lib/tmdb.ts`
  - Confirm `react-native-web` does not appear in `package.json` dependencies

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Fixes 1–5 modify independent files and can be implemented in parallel
- Fix 6 (tests) depends on fixes 1–5 being complete to test the final integrated state
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The Maestro E2E test requires a running emulator/device and is not part of the CI unit test suite

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "3.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["7.1", "7.2"] }
  ]
}
```
