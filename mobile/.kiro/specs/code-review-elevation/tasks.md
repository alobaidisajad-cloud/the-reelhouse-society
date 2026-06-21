# Tasks: Code Review Elevation

## Task 1: Eliminate Duplicated Bootstrap Logic from _layout.tsx
- [x] Remove `MemoryManager.initialize()` call from _layout.tsx useEffect (line ~65)
- [x] Remove the `onunhandledrejection` handler registration from _layout.tsx useEffect (lines ~67-76)
- [x] Remove the MMKV Sentry user parse block from _layout.tsx (lines ~78-88) — AppBootstrapper handles this via setSentryUser after auth resolves
- [x] Remove all SDK initialization from the `prepare()` function: initRevenueCat, identifyRevenueCatUser, registerForPushNotifications, and the dynamic import of notificationStore.setupRealtime (lines ~96-106)
- [x] Remove the NetInfo.addEventListener from _layout.tsx (lines ~113-117)
- [x] Remove the AppState.addEventListener from _layout.tsx (lines ~120-132)
- [x] Keep `initSentry()` in _layout.tsx (must run before first render)
- [x] Keep `restoreSession()` and `setAppReady(true)` in prepare()
- [x] Verify the app boots correctly: auth restores, AppBootstrapper picks up user and initializes all SDKs

## Task 2: Remove Dead hydrateFollowing from auth.ts and Wire socialSlice
- [x] Add import at top of auth.ts: `import { hydrateFollowing } from './domain/socialSlice'`
- [x] Remove the entire `hydrateFollowing` function definition from auth.ts (the export async function at ~line 220 to end)
- [x] Remove the `_persistFollowingToCache` helper function from auth.ts
- [x] Verify the two existing call sites (`restoreSession` and `login`) now call the imported socialSlice version
- [x] Ensure backward compatibility: the `user.following` field on authStore is still populated (socialSlice writes to useSocialStore, but ironvault cache in restoreSession still reads `cachedFollowing`)

## Task 3: Delegate auth.ts updateUser DB writes to ProfileService
- [x] Add import: `import { ProfileService } from '../services/ProfileWriteService'`
- [x] In `updateUser`, replace the inline supabase.from('profiles').update(dbUpdates).eq('id', user.id) call with `await ProfileService.updateProfile(user.id, safeUpdates)`
- [x] Keep the optimistic update and rollback pattern exactly as-is
- [x] Keep the throttle logic exactly as-is
- [x] Remove the `DBProfileUpdate` interface (no longer needed — ProfileService handles mapping)
- [x] Verify profile updates still work: bio, username, avatar_url, display_name, is_social_private, preferences

## Task 4: Add Search Budget Timeout to TMDB Search
- [x] At the top of `tmdb.search()`, add: `const searchStart = Date.now(); const SEARCH_BUDGET_MS = 6000;`
- [x] After Tier 1 returns with 0 results (before Tier 2 starts), add budget check: `if (Date.now() - searchStart > SEARCH_BUDGET_MS) { data.searchType = 'failed'; return data; }`
- [x] After Tier 2 completes with no winner (before Tier 3 starts), add budget check: `if (Date.now() - searchStart > SEARCH_BUDGET_MS) { data.searchType = 'failed'; return data; }`
- [x] Verify: fast searches (< 1s Tier 1 response with results) are completely unaffected
- [x] Verify: searches that hit Tier 2 fallback still work when within budget

## Task 5: Add Request Cancellation to useUniversalSearch
- [x] In `useUniversalSearch`, change queryFn to destructure signal: `queryFn: async ({ signal }) => {`
- [x] Wrap the profiles Supabase query with `withAbortSignal(query, signal)`
- [x] Wrap the logs Supabase query with `withAbortSignal(query, signal)`
- [x] Wrap the lists Supabase query with `withAbortSignal(query, signal)`
- [x] Add import if not present: `import { withAbortSignal } from '@/src/utils/withAbortSignal'`
- [x] Verify: typing rapidly in search doesn't produce stale results from earlier keystrokes

## Task 6: Create Test Infrastructure and jest.config.js
- [x] Add `"test": "jest"` to package.json scripts
- [x] Create `jest.config.js` at project root with: `module.exports = { preset: 'jest-expo', transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|react-native-mmkv)'], testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'] }`
- [x] Create `jest.setup.ts` with MMKV mock: `jest.mock('react-native-mmkv', () => ({ MMKV: jest.fn(() => ({ set: jest.fn(), getString: jest.fn(), delete: jest.fn(), contains: jest.fn() })) }))`
- [x] Verify `npx jest --passWithNoTests` runs without errors

## Task 7: Write Property-Based Tests for tier.ts
- [x] Create `src/utils/__tests__/tier.test.ts`
- [x] Test property: `resolveTier` output weight is always >= max(input tier weight, input role weight) — Highest Watermark Rule
- [x] Test property: `resolveTier(null)` and `resolveTier(undefined)` always return 'cinephile'
- [x] Test property: `resolveTier({ is_founding: true, ... })` always returns 'founding' regardless of other fields
- [x] Test property: `normalizeTier` never returns an invalid tier string
- [x] Test property: `isArchivistPlusTier` returns true for archivist, auteur, founding; false for cinephile
- [x] Use fast-check for property generation
- [x] All tests pass

## Task 8: Write Property-Based Tests for mutationExecutor applyIdMapToPayload
- [x] Create `src/utils/__tests__/mutationExecutor.test.ts`
- [x] Test property: all keys present in idMap that exist in payload are remapped in output
- [x] Test property: keys NOT in idMap are unchanged in output
- [x] Test property: output has same keys as input (no keys added or removed)
- [x] Test property: applying an empty idMap returns the original payload unchanged
- [x] Use fast-check for property generation
- [x] All tests pass

## Task 9: Write Property-Based Tests for networkError.ts
- [x] Create `src/utils/__tests__/networkError.test.ts`
- [x] Test: errors with 'fetch', 'network', 'offline', 'timeout' in message return true
- [x] Test: errors with status 502, 503, 504 return true
- [x] Test: errors with postgres connection codes (57014, 08000, 08003, 08006) return true
- [x] Test: errors with status 400, 401, 403, 404, 409, 422 return false
- [x] Test: errors with PGRST codes return false
- [x] Test property: `isNetworkError` never throws regardless of input type (null, undefined, number, object, Error)
- [x] All tests pass

## Task 10: Fix Unbounded Memory Growth in content.ts
- [x] In `content.ts` `fetchDossiers()`, remove `full_content` from the Supabase select string
- [x] In `content.ts` `loadMoreDossiers()`, remove `full_content` from the Supabase select string
- [x] Update the `DossierRow` interface in content.ts to make `full_content` optional (it already is via `string | null`)
- [x] In `applyPendingToDossierRow` and `buildDossierFromPendingCreate` (in dossierReconciliation.ts), ensure `fullContent` defaults to `''` when not present
- [x] Verify: Dispatch feed cards still display excerpts correctly
- [x] Verify: Dossier detail screen still loads full content via DossierService.getDossierDetails()
- [x] Verify: Creating a new dossier (with fullContent in the optimistic state) still works
- [x] Verify: Editing a dossier still works (fullContent comes from the edit form, not the list state)
