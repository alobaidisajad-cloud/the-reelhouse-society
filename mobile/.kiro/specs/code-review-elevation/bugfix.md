# Bugfix Requirements Document

## Introduction

This document captures the critical quality issues identified across the ReelHouse mobile app codebase that prevent it from achieving world-class status. The "bug" is a collection of systemic issues across architecture, performance, security, reliability, and maintainability that have real, measurable consequences — from memory leaks that cause OOM crashes, to race conditions that corrupt user data, to architectural patterns that actively slow down development velocity.

The issues are prioritized by impact: issues that cause data loss, crashes, or security vulnerabilities come first, followed by performance issues users can feel, then maintainability issues that compound over time.

---

## Bug Analysis

### Current Behavior (Defect)

**Dimension 1: Architecture & System Design**

1.1 WHEN the app boots cold THEN the system performs session restoration in `_layout.tsx` AND SIMULTANEOUSLY the `AppBootstrapper` subscribes to auth state changes, creating a race condition where `hydrateFollowing()` can be called twice concurrently (once from `restoreSession` in auth.ts line 73, once from AppBootstrapper's subscription)

1.2 WHEN the `interactionSlice` is used as a `StateCreator` type THEN it is never actually composed into a unified Zustand store via `create()` — it exists as an orphaned slice pattern with no parent store, meaning consumers must import it standalone and the slice interface is misleading

1.3 WHEN a developer needs to understand data flow THEN the system has three overlapping state management patterns for the same domain: `auth.ts` stores `following` on the User object, `followStore.ts` maintains a separate `following` array, AND `socialSlice.ts` mutates `followStore` — creating confusion about the authoritative source of truth

**Dimension 2: Code Craftsmanship & Quality**

1.4 WHEN `LogService.getLogDetails` validates the response with `LogDetailSchema.safeParse` AND validation fails THEN the system logs a warning but STILL returns the unvalidated `logData` object, meaning Zod validation is purely decorative and provides no runtime safety

1.5 WHEN `LoungeService.getLoungeDetails` validates with `LoungeDetailSchema.safeParse` AND validation fails THEN the system logs a warning but returns the raw unvalidated data — same decorative validation pattern repeated across multiple services

1.6 WHEN offline queue mutations are processed THEN the `executeMutation` function uses `any` type casting extensively (`as any`) in payload access patterns throughout `offlineQueue.ts` and `mutationExecutor.ts`, bypassing TypeScript safety at the most critical data boundary

**Dimension 3: Performance**

1.7 WHEN the app is in the foreground THEN the `FilmGrainOverlay` runs a continuous GPU shader animation via Reanimated `withRepeat` that never pauses, consuming GPU cycles on every frame even when the user is reading static content or typing

1.8 WHEN the `useFollowingFeed` hook falls back to the direct query strategy AND the user follows more than 150 users THEN the system silently truncates the following list to 150 UUIDs, meaning users with large social graphs see an incomplete feed with no indication of data loss

1.9 WHEN `getStacksFeed` direct query fallback executes THEN it fetches up to 10,000 list items AND 10,000 interactions in parallel with `.limit(10000)`, which on cellular connections can cause multi-second stalls and potential timeout failures

**Dimension 4: Security**

1.10 WHEN the TMDB API key is embedded via `process.env.EXPO_PUBLIC_TMDB_API_KEY` THEN it is compiled into the JavaScript bundle and exposed to any user who inspects the app binary — unlike the Supabase anon key (which is designed for client exposure), the TMDB API key has usage quotas and can be abused if extracted

1.11 WHEN `FeedService.getStacksFeed` constructs a search query THEN it uses `escapeSearchPattern` but injects the result directly into `.or()` with string interpolation (`"%${safeVal}%"`), which depending on PostgREST version could still allow filter injection through specially crafted search strings

1.12 WHEN the `useSafeAsync` hook's promise is abandoned due to unmount THEN the promise is never rejected or resolved from the caller's perspective — it becomes a permanently pending promise that holds references to the closure scope, creating a subtle memory leak for long-running operations

**Dimension 5: Reliability & Resilience**

1.13 WHEN `restoreSession` loads the cached user from MMKV (`ironvault_user_cache_`) AND then fetches the fresh profile from Supabase THEN it overwrites `following` with the stale `cachedFollowing` array (line 67: `following: cachedFollowing`), discarding any server-side following changes until `hydrateFollowing()` completes asynchronously

1.14 WHEN the offline queue `flushOfflineQueue` encounters a network failure mid-flush THEN it halts the entire queue to "preserve causality", but mutations that are NOT causally dependent (e.g., an endorsement and an unrelated profile update) are unnecessarily blocked, potentially for 24 hours until they expire

1.15 WHEN `setPreference` in auth.ts debounces the network sync with `setTimeout` AND the app is force-killed during the 1000ms debounce window THEN the preference update is lost — the optimistic local state was written to MMKV but the server never receives the update, creating permanent client/server divergence

**Dimension 6: User Experience (as expressed in code)**

1.16 WHEN a user triggers the ErrorBoundary retry mechanism AND the retry succeeds THEN the `retryCount` is never reset to 0, meaning after 3 total lifetime errors the retry button becomes permanently disabled until the app is fully restarted

1.17 WHEN the app loses network connectivity AND mutations are queued offline AND the queue exceeds 100 entries THEN the system silently drops the oldest mutations without informing the user which specific actions were lost, potentially discarding important reviews or list edits

1.18 WHEN the notification store `loadMoreNotifications` deduplicates using `existingIds` THEN it calculates `_unreadCount` only from the deduped batch but the cursor is set from the FULL `allNotifs` array after slicing to 500, meaning the cursor can point to a notification that was already in state, causing the next page to skip items

**Dimension 7: Maintainability & Longevity**

1.19 WHEN a developer reads the codebase THEN they encounter extensive "audit fix" comments referencing internal ticket IDs (e.g., "P0-1c AUDIT FIX", "T2-02 AUDIT FIX", "F-16 APEX FIX", "ELITE FIX") that have no external documentation, making it impossible to understand the original bug context or whether the fix is still relevant

1.20 WHEN `AppBootstrapper` initializes third-party SDKs (RevenueCat, Sentry, push notifications, OTA updates) THEN all initialization is coupled into a single monolithic `boot()` function with no dependency injection or testability seams, making it impossible to unit test any individual boot step

**Dimension 8: Consistency & Coherence**

1.21 WHEN services validate response data THEN some use strict `z.array(schema).parse()` that throws on invalid data (FilmService, FeedService), while others use `safeParse` that logs and continues with unvalidated data (LogService, LoungeService, NotificationStore) — creating inconsistent failure modes where some screens crash on schema changes and others silently show corrupt data

1.22 WHEN pagination is implemented THEN some feeds use page size 40 (community, following), some use 60 (stacks), some use 30 (notifications), and some use 500 (endorsements fetch) — with no documented rationale for the variance, making it unclear which values are intentional and which are arbitrary

**Dimension 9: Dependencies & Ecosystem**

1.23 WHEN the app fetches news content THEN it depends on `api.rss2json.com` — a free third-party service with no SLA, no authentication, and no fallback other than hardcoded stale content — meaning the news feature silently degrades to showing fake placeholder articles from an unknown date

1.24 WHEN `react-native-web` version `~0.21.0` is included as a dependency THEN it conflicts with the React 19.1.0 / React Native 0.81.5 ecosystem, as react-native-web 0.21.x was designed for React Native 0.74.x — creating potential runtime incompatibilities for any web target

**Dimension 10: The Unmeasured**

1.25 WHEN the `useAuthStore.login` function enriches the user profile in the background via `Promise.resolve().then()` AND the enrichment fails THEN the `.catch(() => {})` silently swallows the error, meaning the user operates with an incomplete profile object (missing display_name, avatar_url, persona, etc.) with no visible indication and no retry mechanism

1.26 WHEN the TMDB search function executes its 3-tier strategy (omni-search → typo fallback → semantic/keyword) THEN it can fire up to `6 + N` parallel HTTP requests for a single user keystroke (where N = number of words), with no global concurrency limit, potentially saturating the TMDB rate limit and causing 429 errors for subsequent legitimate requests

---

### Expected Behavior (Correct)

**Dimension 1: Architecture & System Design**

2.1 WHEN the app boots cold THEN the system SHALL have a single, deterministic boot sequence where `hydrateFollowing()` is called exactly once after session restoration completes, with no possibility of concurrent invocations

2.2 WHEN domain slices are defined THEN they SHALL be composed into a single unified store via `create()` with proper TypeScript generics, OR refactored into standalone stores like `followStore.ts` — eliminating the orphaned `StateCreator` pattern

2.3 WHEN a developer needs to understand social graph state THEN there SHALL be exactly one authoritative source of truth for the `following` list — the `useSocialStore` — with the auth store's User object containing no redundant `following` property

**Dimension 2: Code Craftsmanship & Quality**

2.4 WHEN `LogService.getLogDetails` validates the response with Zod AND validation fails THEN the system SHALL either throw a structured error (for hard failures) OR return a validated fallback/partial object that guarantees type safety for consumers — never returning raw unvalidated data

2.5 WHEN any service validates read-path responses THEN the system SHALL use a consistent validation strategy: either `parse()` with try/catch for strict boundaries, or `safeParse()` with explicit fallback handling that returns typed results — applied uniformly across all services

2.6 WHEN offline queue mutations are processed THEN the system SHALL use properly typed payload interfaces for each mutation type, eliminating `as any` casts at the mutation execution boundary

**Dimension 3: Performance**

2.7 WHEN the app is in the foreground but the user is not actively scrolling THEN the `FilmGrainOverlay` SHALL use a static noise texture or frame-rate-limited animation (e.g., 4-8 FPS) instead of a continuous 60fps shader, reducing GPU power consumption by 80%+ during idle states

2.8 WHEN the user follows more than 150 users AND the direct query fallback is used THEN the system SHALL either paginate the following-feed query OR clearly indicate to the user that their feed is filtered, AND log a metric to track how often the truncation occurs

2.9 WHEN `getStacksFeed` fetches list items and interactions THEN it SHALL use pagination or server-side aggregation (via RPC) to avoid unbounded `.limit(10000)` queries, capping individual requests to reasonable sizes (e.g., 500 items per batch)

**Dimension 4: Security**

2.10 WHEN the app accesses the TMDB API THEN it SHALL route requests through a backend proxy that holds the API key server-side, preventing quota abuse from extracted keys — OR at minimum, implement client-side rate limiting that prevents abuse patterns

2.11 WHEN search queries are used in PostgREST filter expressions THEN the system SHALL use parameterized query patterns or Supabase's `.ilike()` method with proper argument binding rather than string interpolation into `.or()` clauses

2.12 WHEN the `useSafeAsync` hook abandons a promise due to unmount THEN it SHALL properly reject the abandoned promise (or resolve it to a sentinel value) so garbage collection can reclaim the closure scope, preventing memory leaks on rapid navigation

**Dimension 5: Reliability & Resilience**

2.13 WHEN `restoreSession` loads a cached user from MMKV THEN the system SHALL NOT overwrite the `following` field on the fresh profile fetch — instead, it SHALL preserve whatever `following` state exists in `useSocialStore` and let `hydrateFollowing()` be the sole authority for updating it

2.14 WHEN the offline queue encounters a network failure THEN the system SHALL distinguish between causally dependent mutations (e.g., create_list → add_film_to_list) and independent mutations, only blocking dependent chains while allowing independent mutations to retry individually

2.15 WHEN `setPreference` debounces the network sync THEN the system SHALL persist a "dirty preferences" flag in MMKV that survives app kills, and reconcile pending preference writes on the next app launch — ensuring server state eventually converges

**Dimension 6: User Experience (as expressed in code)**

2.16 WHEN the ErrorBoundary retry succeeds THEN the `retryCount` SHALL be reset to 0, giving the user a fresh set of retry attempts for any future unrelated errors

2.17 WHEN the offline queue drops mutations due to capacity limits THEN the system SHALL display a toast or persistent banner informing the user which specific action types were dropped, and offer a "retry now" option before expiration

2.18 WHEN `loadMoreNotifications` deduplicates and paginates THEN the cursor SHALL be computed from the last item of the NEWLY FETCHED batch (not the merged array), ensuring the next page request starts from the correct position regardless of deduplication

**Dimension 7: Maintainability & Longevity**

2.19 WHEN code contains bug fix annotations THEN they SHALL reference a documented ADR (Architecture Decision Record) or linked issue with context, AND stale fix comments for bugs that have been resolved for more than 6 months SHALL be removed or consolidated into architectural documentation

2.20 WHEN `AppBootstrapper` initializes third-party SDKs THEN each SDK initialization SHALL be extracted into an independent, testable function with a clear interface, allowing individual boot steps to be tested in isolation and replaced without modifying the orchestrator

**Dimension 8: Consistency & Coherence**

2.21 WHEN services validate response data THEN ALL services SHALL use the same validation strategy — specifically, the resilient `parseRowsSafely` pattern from FeedService that salvages valid rows while logging invalid ones — applied uniformly to create consistent, graceful degradation across all data boundaries

2.22 WHEN pagination is implemented THEN page sizes SHALL be defined as named constants in a shared configuration with documented rationale (e.g., `FEED_PAGE_SIZE = 40` based on viewport calculations, `NOTIFICATION_PAGE_SIZE = 30` based on typical unread counts)

**Dimension 9: Dependencies & Ecosystem**

2.23 WHEN the app fetches news content THEN it SHALL use a self-hosted RSS proxy or direct RSS parsing library, eliminating the dependency on an unreliable free third-party service — OR clearly mark the news feature as "best-effort" with proper empty states when the service is unavailable

2.24 WHEN `react-native-web` is included as a dependency THEN it SHALL be version-compatible with the React and React Native versions in use, OR removed if web support is not actively maintained

**Dimension 10: The Unmeasured**

2.25 WHEN the `login` function enriches the user profile in the background AND enrichment fails THEN the system SHALL retry the enrichment with exponential backoff (using the existing `withRetry` utility), and if all retries fail, log to Sentry and show a non-blocking notification that profile data may be incomplete

2.26 WHEN TMDB search executes THEN it SHALL implement a global concurrency limiter (max 3 concurrent TMDB requests) and debounce the search input at the hook level (300ms minimum), preventing rate limit exhaustion and wasted bandwidth from rapid keystroke searches

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user logs in with valid credentials THEN the system SHALL CONTINUE TO authenticate via Supabase, store auth tokens in SecureStore, set the user in the auth store, and navigate to the authenticated state

3.2 WHEN the app goes to background THEN the system SHALL CONTINUE TO pause Supabase auth auto-refresh, clear memory caches via MemoryManager, and cancel active animations

3.3 WHEN a user endorses a log entry THEN the system SHALL CONTINUE TO perform optimistic UI updates, queue the mutation for offline sync if disconnected, and rollback on non-network errors

3.4 WHEN the offline queue flushes on network reconnection THEN the system SHALL CONTINUE TO process mutations in FIFO order, handle duplicate key constraints gracefully, route dead-letter mutations to the diagnostics queue, and show a success toast

3.5 WHEN a user navigates between tabs THEN the system SHALL CONTINUE TO use lazy loading for tab screens, maintain the haptic feedback on tab press, show spring-animated icon transitions, and preserve the frosted glass tab bar aesthetic

3.6 WHEN the Supabase auth token expires AND the app is in the foreground THEN the system SHALL CONTINUE TO auto-refresh the token, and on refresh failure, sign the user out locally and redirect to the login screen

3.7 WHEN Zod schema validation succeeds on response data THEN the system SHALL CONTINUE TO return the validated data with proper TypeScript types, maintaining the existing type-safe data flow from service layer to UI components

3.8 WHEN push notifications arrive via Supabase Realtime THEN the system SHALL CONTINUE TO validate payloads with Zod, deduplicate against existing notifications, maintain the unread count, and respect the 50-notification display cap

3.9 WHEN the user logs out THEN the system SHALL CONTINUE TO tear down realtime channels, clear all stores via `resetAllStores()`, remove push tokens, clear RevenueCat identity, purge MMKV caches, and reset Sentry user context

3.10 WHEN cursor-based pagination is used in feeds THEN the system SHALL CONTINUE TO use the compound `created_at|id` cursor format, handle timestamp collisions, and return proper `nextCursor` values for infinite scroll
