# Requirements: Code Review Elevation

## Requirement 1: Eliminate Duplicated Bootstrap Logic
### User Story
As a developer, I want a single source of truth for app initialization so that SDKs are never double-initialized and Sentry doesn't capture errors twice.
### Acceptance Criteria
- [ ] `_layout.tsx` only handles: font loading, splash screen, router definition, deep link handling, and `initSentry()` (must run before first render)
- [ ] `MemoryManager.initialize()` is called only in `AppBootstrapper.tsx`
- [ ] `onunhandledrejection` handler is registered only in `AppBootstrapper.tsx`
- [ ] RevenueCat init is called only in `AppBootstrapper.tsx`
- [ ] Push notification registration is called only in `AppBootstrapper.tsx`
- [ ] NetInfo listener for offline queue flush exists only in `AppBootstrapper.tsx`
- [ ] AppState listener for OTA + flush exists only in `AppBootstrapper.tsx`
- [ ] App boots successfully and all SDKs initialize correctly on cold start

## Requirement 2: Remove Dead Social Code from auth.ts
### User Story
As a developer, I want auth.ts to contain only session lifecycle logic so that the social graph hydration isn't duplicated with an inferior implementation.
### Acceptance Criteria
- [ ] The `hydrateFollowing` function is removed from `auth.ts`
- [ ] `restoreSession()` calls `hydrateFollowing` from `src/stores/domain/socialSlice`
- [ ] `login()` calls `hydrateFollowing` from `src/stores/domain/socialSlice`
- [ ] `updateUser()` delegates DB writes to `ProfileService.updateProfile()` instead of inline Supabase calls
- [ ] All existing functionality (optimistic update, rollback, throttle) is preserved
- [ ] The `following` field on the user object is still populated for backward compatibility

## Requirement 3: Add Search Budget Timeout to TMDB Search
### User Story
As a user, I want search results to appear within 6 seconds even on slow connections, rather than waiting 20+ seconds for fallback tiers.
### Acceptance Criteria
- [ ] A time budget of 6 seconds is enforced across the entire `tmdb.search()` function
- [ ] If Tier 1 exhausts the budget, Tier 2 and Tier 3 are skipped
- [ ] If Tier 2 exhausts the budget, Tier 3 is skipped
- [ ] The function returns `{ searchType: 'failed', results: [] }` when budget is exceeded
- [ ] Normal fast searches (< 2s) are completely unaffected

## Requirement 4: Add Request Cancellation to Universal Search
### User Story
As a user, I want my search queries to cancel server-side when I type a new character or navigate away, so the app doesn't waste server resources.
### Acceptance Criteria
- [ ] `useUniversalSearch` destructures `signal` from the TanStack Query queryFn context
- [ ] All 3 Supabase queries (profiles, logs, lists) receive the signal via `withAbortSignal`
- [ ] Typing a new character cancels in-flight Supabase queries from the previous keystroke
- [ ] Navigating away from the search screen cancels in-flight queries

## Requirement 5: Add Automated Test Infrastructure
### User Story
As a developer, I want property-based tests for critical pure functions so that I have confidence making changes to the offline queue, tier resolution, and mutation system.
### Acceptance Criteria
- [ ] `package.json` has a `"test"` script that runs Jest
- [ ] `jest.config.js` exists and extends jest-expo preset
- [ ] `src/utils/__tests__/tier.test.ts` exists with property-based tests for `resolveTier`
- [ ] `src/utils/__tests__/offlineQueue.test.ts` exists with invariant tests
- [ ] `src/utils/__tests__/mutationExecutor.test.ts` exists with `applyIdMapToPayload` property tests
- [ ] `src/utils/__tests__/networkError.test.ts` exists with classification property tests
- [ ] All tests pass

## Requirement 6: Fix Unbounded Memory Growth in Content Store
### User Story
As a user with a low-memory device, I want the Dispatch feed to not accumulate megabytes of HTML content in memory during a session.
### Acceptance Criteria
- [ ] `content.ts` list queries no longer fetch `full_content` from Supabase
- [ ] The `Dossier` store type's `fullContent` field is set to empty string in the list mapper
- [ ] The dossier detail screen still loads full content via `DossierService.getDossierDetails()`
- [ ] Dispatch feed cards continue to display excerpts correctly
- [ ] CRUD operations (add, update, delete dossier) continue to work with offline queue support
