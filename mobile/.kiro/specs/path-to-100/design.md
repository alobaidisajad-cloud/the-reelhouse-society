# Design Document

## Overview

This document details the implementation design for the six targeted fixes that bring the ReelHouse mobile app to 100/100 quality. Each fix is a surgical change to an existing module — no new architectural layers are introduced. The changes span: TMDB proxy client migration, feed query bounds, preference sync durability, boot observability, dependency removal, and boot verification tests.

## Architecture

The fixes operate within the existing architecture:

```
┌─────────────────────────────────────────────────────────┐
│  app/_layout.tsx (Root_Layout)                          │
│    └── AppBootstrapper  ← [Fix 4: breadcrumbs]         │
│          └── Stack (Navigation)                         │
├─────────────────────────────────────────────────────────┤
│  src/lib/tmdb.ts (TMDB_Client)  ← [Fix 1: proxy]      │
│  src/services/FeedService.ts    ← [Fix 2: bounds]      │
│  src/stores/auth.ts (Auth_Store)← [Fix 3: durability]  │
│  src/lib/sentry.ts              (unchanged, consumed)   │
├─────────────────────────────────────────────────────────┤
│  supabase/functions/tmdb-proxy/  (already deployed)     │
└─────────────────────────────────────────────────────────┘
```

No new services, stores, or providers are introduced. Each fix modifies a single file (or removes a dependency).

## Components and Interfaces

### Component 1: TMDB Client Proxy Migration (`src/lib/tmdb.ts`)

**Current state:** `fetchTMDB` constructs a direct URL `https://api.themoviedb.org/3{path}?api_key={EXPO_PUBLIC_TMDB_API_KEY}` and calls `fetch(url)`.

**Target state:** `fetchTMDB` POSTs `{ path }` to the Supabase Edge Function proxy with auth headers. The TMDB API key is never in the client bundle.

```typescript
// Constants replacing TMDB_API_KEY + TMDB_BASE
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const PROXY_URL = `${SUPABASE_URL}/functions/v1/tmdb-proxy`;

// Inside fetchTMDB, the fetch call becomes:
const res = await fetch(PROXY_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ path }),
  signal: controller.signal,
});
```

**Preserved behaviors (unchanged):**
- LRU cache (`_cache` Map, 200 entries, 10-min TTL)
- Inflight deduplication (`_inflight` Map)
- 3-attempt retry with exponential backoff on 429/503
- 10-second AbortController timeout
- Fallback value return on non-retryable errors

**Removed:**
- `const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY || '';`
- `const TMDB_BASE = 'https://api.themoviedb.org/3';`
- Direct URL construction `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}`

### Component 2: Bounded Fallback Queries (`src/services/FeedService.ts`)

**Change:** In `getStacksFeed` Strategy 2 fallback, reduce the `.limit()` values on the parallel sub-queries:

```typescript
// BEFORE
supabase.from('list_items')...limit(10000)
supabase.from('interactions')...limit(10000)

// AFTER
supabase.from('list_items')...limit(600)
supabase.from('interactions')...limit(3000)
```

**Rationale:** 60 stacks × 10 films/stack = 600 items max needed. 60 stacks × 50 endorsements/stack = 3000 interactions max useful. The previous 10,000 limit transferred excessive data on constrained networks.

### Component 3: Preference Sync Durability (`src/stores/auth.ts`)

**New MMKV key:** `dirty_prefs_{userId}` — boolean flag stored as `'true'` / deleted.

**Changes to `setPreference`:**

```typescript
setPreference: async (key, value) => {
  const user = get().user;
  if (!user) return;
  const prevValue = user.preferences?.[key];
  const prefs = { ...(user.preferences ?? {}), [key]: value };

  // 1. Optimistic update
  set((state) => ({ user: state.user ? { ...state.user, preferences: prefs } : null }));
  storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify({ ...get().user, preferences: prefs }));

  // 2. Set dirty flag
  storage.set(`dirty_prefs_${user.id}`, 'true');

  // 3. Debounced network sync
  const timerKey = `pref:${user.id}`;
  if (_prefTimers.has(timerKey)) clearTimeout(_prefTimers.get(timerKey)!);

  _prefTimers.set(timerKey, setTimeout(async () => {
    _prefTimers.delete(timerKey);
    try {
      const currentPrefs = get().user?.preferences;
      if (!currentPrefs) return;
      await supabase.from('profiles').update({ preferences: currentPrefs }).eq('id', user.id);
      // Sync succeeded — clear dirty flag
      storage.delete(`dirty_prefs_${user.id}`);
    } catch {
      // Sync failed — dirty flag remains true, rollback local state
      const rollbackPrefs = { ...(get().user?.preferences ?? {}), [key]: prevValue };
      set((state) => ({ user: state.user ? { ...state.user, preferences: rollbackPrefs } : null }));
      storage.set(`ironvault_user_cache_${user.id}`, JSON.stringify(get().user));
    }
  }, 1000));
},
```

**Changes to `restoreSession`:**

```typescript
restoreSession: async () => {
  try {
    let cachedFollowing: string[] = [];
    const lastUserId = storage.getString('last_user_id');
    if (lastUserId) {
      const vaultData = storage.getString(`ironvault_user_cache_${lastUserId}`);
      if (vaultData) {
        try {
          const parsedUser = JSON.parse(vaultData);
          cachedFollowing = parsedUser.following ?? [];
          set({ user: parsedUser, isAuthenticated: true, loading: false });
        } catch {}
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Dirty-prefs push: reconcile before overwriting local with server data
      const isDirty = storage.getString(`dirty_prefs_${session.user.id}`) === 'true';
      if (isDirty) {
        const cachedUser = storage.getString(`ironvault_user_cache_${session.user.id}`);
        if (cachedUser) {
          try {
            const parsed = JSON.parse(cachedUser);
            if (parsed.preferences) {
              await supabase.from('profiles')
                .update({ preferences: parsed.preferences })
                .eq('id', session.user.id);
              storage.delete(`dirty_prefs_${session.user.id}`);
            }
          } catch {
            // Push failed — preserve local prefs, proceed without overwriting
            // dirty flag remains set for next session
          }
        }
      }

      const { data: profile } = await supabase
        .from('profiles').select(PROFILE_SELECT_COLUMNS).eq('id', session.user.id).single();
      if (profile) {
        // If dirty push failed, merge local prefs over server prefs
        const localDirtyStill = storage.getString(`dirty_prefs_${session.user.id}`) === 'true';
        let finalPrefs = profile.preferences;
        if (localDirtyStill) {
          const cachedUser = storage.getString(`ironvault_user_cache_${session.user.id}`);
          if (cachedUser) {
            try { finalPrefs = JSON.parse(cachedUser).preferences ?? finalPrefs; } catch {}
          }
        }
        const completeUser = {
          ...session.user, ...profile,
          preferences: finalPrefs,
          following: cachedFollowing,
        } as unknown as User;
        storage.set('last_user_id', session.user.id);
        storage.set(`ironvault_user_cache_${session.user.id}`, JSON.stringify(completeUser));
        set({ user: completeUser, isAuthenticated: true, loading: false });
        hydrateFollowing();
        return;
      }
    }
  } catch (err: unknown) {
    if (__DEV__) console.warn('[restoreSession] Failed:', err instanceof Error ? err.message : String(err));
  }
  set({ loading: false });
},
```

### Component 4: Boot Observability Breadcrumbs (`src/providers/AppBootstrapper.tsx`)

**Changes to `boot()` function:** Add `addBreadcrumb` calls after each successful subsystem init, and `Sentry.setTag` at the end.

```typescript
import { addBreadcrumb, Sentry } from '../lib/sentry';

async function boot(currentUser: { ... }) {
  if (hasBooted.current) return;
  hasBooted.current = true;

  try {
    // ── Sentry User Context ──
    setSentryUser({ ... });
    addBreadcrumb('Sentry user context initialized', 'boot');

    // ── RevenueCat ──
    try {
      await initRevenueCat(currentUser.id);
      identifyRevenueCatUser(currentUser.id);
      addBreadcrumb('RevenueCat initialized', 'boot');
    } catch (rcErr) { ... }

    // ── Push Notifications ──
    registerForPushNotifications(currentUser.id);
    addBreadcrumb('Push notifications registered', 'boot');

    // ── Real-time Notification Service ──
    try {
      Promise.resolve(useNotificationStore.getState().setupRealtime())...;
      addBreadcrumb('Notification service setup', 'boot');
    } catch (e) { ... }

    // ── Background Hydration ──
    try {
      Promise.resolve(hydrateFollowing())...;
      addBreadcrumb('Background hydration started', 'boot');
    } catch (e) { ... }

    // ── Boot complete tag ──
    Sentry.setTag('boot_complete', 'true');
  } catch (err) {
    logger.warn('[Bootstrapper] Error during boot:', err);
  }
}
```

### Component 5: Remove react-native-web (`package.json`)

**Changes:**
1. Remove `"react-native-web": "^0.21.0"` from `dependencies`
2. Remove `"web": "expo start --web"` from `scripts`

### Component 6: Boot Verification Tests

**Unit Test:** `app/__tests__/boot-structure.test.tsx`

```typescript
import { render } from '@testing-library/react-native';

// Mock all external dependencies to avoid network calls
jest.mock('@/src/lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn().mockResolvedValue({ data: { session: null } }), onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }) } } }));
jest.mock('@/src/lib/revenueCat', () => ({ initRevenueCat: jest.fn(), identifyUser: jest.fn(), logoutRevenueCat: jest.fn() }));
jest.mock('@/src/lib/pushNotifications', () => ({ registerForPushNotifications: jest.fn(), setupNotificationResponseHandler: jest.fn().mockResolvedValue(undefined), removePushToken: jest.fn() }));
jest.mock('@/src/lib/sentry', () => ({ initSentry: jest.fn(), setSentryUser: jest.fn(), addBreadcrumb: jest.fn(), captureError: jest.fn(), Sentry: { setTag: jest.fn() } }));

describe('Boot Structure', () => {
  it('renders AppBootstrapper within root layout tree', () => {
    // Render RootLayout and verify AppBootstrapper is in the tree
    const { UNSAFE_getByType } = render(<RootLayout />);
    const AppBootstrapper = require('@/src/providers/AppBootstrapper').default;
    expect(UNSAFE_getByType(AppBootstrapper)).toBeTruthy();
  });
});
```

**Maestro E2E:** `.maestro/boot_verification.yaml`

```yaml
appId: com.reelhouse.mobile
---
- launchApp
- assertVisible:
    id: "feed-screen"
    timeout: 15000
```

## Interfaces

### Modified Interface: `fetchTMDB<T>(path: string, fallback: T | null): Promise<T | null>`

No signature change. Internal implementation changes from direct TMDB fetch to proxy POST.

**Request contract (outgoing):**
```typescript
// POST ${SUPABASE_URL}/functions/v1/tmdb-proxy
{
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': string,           // EXPO_PUBLIC_SUPABASE_ANON_KEY
    'Authorization': string,    // 'Bearer ' + EXPO_PUBLIC_SUPABASE_ANON_KEY
  },
  body: JSON.stringify({ path: string })  // e.g. "/movie/550?append_to_response=credits"
}
```

**Response contract (from proxy):** Unchanged JSON body from TMDB, or `{ error: string }` on failure.

### Modified Interface: `setPreference(key: string, value: unknown): Promise<void>`

No signature change. Internal behavior now sets a dirty flag in MMKV before the debounced sync.

### Modified Interface: `restoreSession(): Promise<void>`

No signature change. Now checks for dirty-prefs flag and pushes locally-cached prefs to server before overwriting.

## Data Models

### New MMKV Key: `dirty_prefs_{userId}`

| Key | Type | Description |
|-----|------|-------------|
| `dirty_prefs_{userId}` | `'true'` or absent | Set when preferences are written locally but not yet confirmed by server. Deleted on successful sync. |

### Removed Environment Variable

| Variable | Status |
|----------|--------|
| `EXPO_PUBLIC_TMDB_API_KEY` | Removed from client. Stored server-side as Supabase secret `TMDB_API_KEY`. |

## Error Handling

### TMDB Proxy Errors

| HTTP Status from Proxy | Client Behavior |
|------------------------|-----------------|
| 429 | Retry (up to 3 attempts, exponential backoff) |
| 503 | Retry (up to 3 attempts, exponential backoff) |
| 400, 403, 404 | Return fallback value immediately |
| 500, 502, 504 | Return fallback value immediately |
| Network error / AbortError | Retry on attempts 0-1, return fallback on attempt 2 |

### Preference Sync Errors

| Scenario | Behavior |
|----------|----------|
| `setPreference` sync timeout fails | Dirty flag remains, local state rolled back to prev value |
| `restoreSession` dirty push fails | Local prefs preserved, server data not overwritten for prefs field, session restore continues |
| MMKV write fails | Caught silently — MMKV writes are synchronous and virtually never fail on device |

### Boot Breadcrumb Errors

Breadcrumb calls are fire-and-forget. If `addBreadcrumb` throws (only possible when Sentry DSN is missing), the guard inside `addBreadcrumb` already returns early. Boot continues regardless.

## Testing Strategy

**Unit tests (Jest + @testing-library/react-native):**
- TMDB client: Mock `fetch`, verify request shape, retry behavior, cache hits, and fallback returns
- Auth store: Mock `supabase` and `storage` (MMKV), verify dirty-flag lifecycle across setPreference and restoreSession
- FeedService: Mock Supabase query builder chain, verify `.limit()` values on fallback path
- AppBootstrapper: Mock all SDK imports, verify breadcrumb calls and Sentry tag on boot

**Property-based tests (fast-check):**
- TMDB proxy request construction across random valid paths
- Retry/fallback behavior across random HTTP error codes
- Dirty-flag state machine across random preference key/value sequences
- Query bounds verification across random list ID sets

**E2E tests (Maestro):**
- Boot verification flow: app launch → feed/lobby screen visible within 15s

**Static checks:**
- Grep/assertion that `EXPO_PUBLIC_TMDB_API_KEY` is absent from `src/lib/tmdb.ts`
- Assertion that `react-native-web` is absent from `package.json` dependencies
- Assertion that `"web"` script is absent from `package.json` scripts

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Proxy request construction

*For any* valid TMDB path string passed to `fetchTMDB`, the outgoing HTTP request SHALL be a POST to `${SUPABASE_URL}/functions/v1/tmdb-proxy` with body `{ "path": "<path>" }`, and SHALL include both an `apikey` header and an `Authorization: Bearer <anon_key>` header with the Supabase anon key value.

**Validates: Requirements 1.1, 1.2**

### Property 2: Retry and cache preservation

*For any* TMDB path, if the proxy returns HTTP 429 or 503, `fetchTMDB` SHALL retry up to 3 total attempts with exponential backoff. *For any* path that has been successfully fetched and is not a search path, a subsequent call within the TTL SHALL return the cached result without issuing a new network request.

**Validates: Requirements 1.4**

### Property 3: Non-retryable error returns fallback

*For any* TMDB path and *for any* HTTP error status that is not 429 or 503, `fetchTMDB` SHALL return the provided fallback value without retrying.

**Validates: Requirements 1.5**

### Property 4: Strategy 2 query bounds

*For any* execution of `getStacksFeed` that falls through to the Strategy 2 direct-query path, the `list_items` sub-query SHALL have a limit of 600 rows and the `interactions` sub-query SHALL have a limit of 3000 rows.

**Validates: Requirements 2.1, 2.2**

### Property 5: Dirty flag set on preference write

*For any* preference key-value pair written via `setPreference`, the MMKV key `dirty_prefs_{userId}` SHALL be set to `'true'` immediately after the write, before the debounced sync fires.

**Validates: Requirements 3.1**

### Property 6: Dirty flag reflects sync outcome

*For any* preference sync attempt, if the network write succeeds THEN the dirty flag SHALL be deleted (cleared), and if the network write fails THEN the dirty flag SHALL remain set to `'true'`.

**Validates: Requirements 3.2, 3.3**

### Property 7: Session restore reconciles dirty preferences

*For any* session restore where `dirty_prefs_{userId}` is `'true'`, the Auth_Store SHALL attempt to push locally-cached preferences to the server before loading server profile data. If the push succeeds, the dirty flag SHALL be cleared. If the push fails, the locally-cached preferences SHALL be preserved and not overwritten by server data.

**Validates: Requirements 3.4, 3.5, 3.6**
