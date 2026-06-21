# Requirements Document

## Introduction

This specification defines six targeted fixes to elevate the ReelHouse mobile app to 100/100 quality. The fixes address: client-side API key exposure (TMDB proxy migration), unbounded fallback queries in the feed service, preference sync durability across sessions, boot observability via Sentry breadcrumbs, removal of the unused react-native-web dependency, and addition of boot verification tests (unit + E2E).

## Glossary

- **TMDB_Client**: The `fetchTMDB` function in `src/lib/tmdb.ts` responsible for all TMDB API requests
- **TMDB_Proxy**: The Supabase Edge Function at `supabase/functions/tmdb-proxy/index.ts` that proxies TMDB requests server-side with rate limiting, path allowlisting, and CDN caching
- **Feed_Service**: The `FeedService` module in `src/services/FeedService.ts` responsible for fetching and composing feed data
- **Auth_Store**: The Zustand store in `src/stores/auth.ts` managing user authentication state, session restoration, and preference persistence
- **App_Bootstrapper**: The headless React component in `src/providers/AppBootstrapper.tsx` that initializes third-party SDKs and background services after authentication
- **Sentry_Module**: The Sentry integration in `src/lib/sentry.ts` providing crash reporting, breadcrumbs, and tagging
- **MMKV_Storage**: The react-native-mmkv synchronous key-value store used for local caching
- **Dirty_Prefs_Flag**: A boolean MMKV key indicating that local preference writes have not yet been confirmed by the server
- **Root_Layout**: The root layout component in `app/_layout.tsx` that renders `App_Bootstrapper` and the navigation stack

## Requirements

### Requirement 1: TMDB Proxy Migration

**User Story:** As a developer, I want TMDB requests routed through the server-side proxy, so that the TMDB API key is never exposed in the client bundle.

#### Acceptance Criteria

1. WHEN `TMDB_Client` sends a request, THE TMDB_Client SHALL POST the request path to `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/tmdb-proxy` with the path in the JSON body `{ "path": "<tmdb-path>" }` instead of calling the TMDB API directly.
2. THE TMDB_Client SHALL include the Supabase anon key in the `apikey` header and the `Authorization: Bearer <anon_key>` header for each proxy request.
3. THE TMDB_Client SHALL remove the direct usage of the `EXPO_PUBLIC_TMDB_API_KEY` constant and the direct TMDB base URL construction from `fetchTMDB`.
4. THE TMDB_Client SHALL preserve existing retry logic (3 attempts with exponential backoff on 429/503), abort timeout (10 seconds), in-memory LRU cache, and inflight deduplication behavior unchanged.
5. WHEN the TMDB_Proxy returns an error response, THE TMDB_Client SHALL treat non-retryable errors identically to the current fallback behavior (return the provided fallback value).
6. THE `.env.example` file SHALL remove the `EXPO_PUBLIC_TMDB_API_KEY` entry.

### Requirement 2: Bounded Fallback Queries

**User Story:** As a user, I want the feed to load reliably without excessive data transfer, so that the app remains responsive on constrained networks.

#### Acceptance Criteria

1. WHEN Feed_Service executes Strategy 2 direct-query fallback, THE Feed_Service SHALL limit the `list_items` query to a maximum of 600 rows.
2. WHEN Feed_Service executes Strategy 2 direct-query fallback, THE Feed_Service SHALL limit the `interactions` query to a maximum of 3000 rows.

### Requirement 3: Preference Sync Durability

**User Story:** As a user, I want my preferences to survive network failures and session restarts, so that local changes are never silently lost.

#### Acceptance Criteria

1. WHEN `setPreference` writes a preference to MMKV_Storage, THE Auth_Store SHALL set the Dirty_Prefs_Flag to `true` in MMKV_Storage.
2. WHEN the debounced network sync to the `profiles` table succeeds, THE Auth_Store SHALL clear the Dirty_Prefs_Flag (set to `false`) in MMKV_Storage.
3. IF the debounced network sync fails, THEN THE Auth_Store SHALL leave the Dirty_Prefs_Flag set to `true` so a subsequent session restore can retry.
4. WHEN `restoreSession` detects that the Dirty_Prefs_Flag is `true`, THE Auth_Store SHALL push the locally-cached preferences to the server before overwriting local state with server data.
5. WHEN the dirty-prefs push in `restoreSession` succeeds, THE Auth_Store SHALL clear the Dirty_Prefs_Flag.
6. IF the dirty-prefs push in `restoreSession` fails, THEN THE Auth_Store SHALL preserve the local preferences in the MMKV cache and proceed with session restore without overwriting them.

### Requirement 4: Boot Observability Breadcrumbs

**User Story:** As a developer, I want visibility into which boot subsystems initialized successfully, so that production crashes during startup can be diagnosed quickly.

#### Acceptance Criteria

1. WHEN App_Bootstrapper successfully initializes the Sentry user context, THE App_Bootstrapper SHALL call `addBreadcrumb()` with a message identifying the Sentry user context initialization.
2. WHEN App_Bootstrapper successfully initializes RevenueCat, THE App_Bootstrapper SHALL call `addBreadcrumb()` with a message identifying the RevenueCat initialization.
3. WHEN App_Bootstrapper successfully registers push notifications, THE App_Bootstrapper SHALL call `addBreadcrumb()` with a message identifying push notification registration.
4. WHEN App_Bootstrapper successfully sets up the real-time notification service, THE App_Bootstrapper SHALL call `addBreadcrumb()` with a message identifying the notification service setup.
5. WHEN App_Bootstrapper successfully hydrates the following list, THE App_Bootstrapper SHALL call `addBreadcrumb()` with a message identifying the background hydration.
6. WHEN App_Bootstrapper completes the full boot sequence without a top-level error, THE App_Bootstrapper SHALL call `Sentry.setTag('boot_complete', 'true')`.

### Requirement 5: Remove react-native-web Dependency

**User Story:** As a developer, I want unused dependencies removed, so that the project stays lean and avoids confusion about supported platforms.

#### Acceptance Criteria

1. THE `package.json` SHALL not include `react-native-web` in the `dependencies` object.
2. THE `package.json` SHALL not include the `"web"` script entry in the `scripts` object.

### Requirement 6: Boot Verification Tests

**User Story:** As a developer, I want automated tests confirming the app boots correctly, so that regressions in the startup path are caught before release.

#### Acceptance Criteria

1. THE project SHALL include a structural unit test that asserts `AppBootstrapper` is rendered as a child within the Root_Layout component tree using `@testing-library/react-native`.
2. THE project SHALL include a Maestro E2E flow file that launches the app and asserts the feed or lobby screen becomes visible within a reasonable timeout, confirming boot completion.
3. WHEN the structural unit test executes, THE test SHALL pass without requiring network access or real Supabase credentials.
4. WHEN the Maestro E2E flow executes on a running emulator or device, THE test SHALL verify that a known UI element on the feed or lobby screen is displayed.
