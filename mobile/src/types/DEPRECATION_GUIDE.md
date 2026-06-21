# Type Deprecation Guide

## `User.following` — Deprecated

**Status:** Deprecated (documentation-level, field still present)  
**Since:** v1.x (Path to 100 — Type-Level Architectural Enforcement)

### What's changing

The `following` field on the `User` type is deprecated. It exists only as a cold-start cache and is **not** the authoritative source for the current user's follow list.

### Authoritative source

```typescript
import { useSocialStore } from '@/src/stores/social';

// Reactive (in components)
const following = useSocialStore((s) => s.following);

// Non-reactive (in services/utilities)
const following = useSocialStore.getState().following;
```

### Migration path

Replace all reads of `user.following` with `useSocialStore.getState().following`:

```diff
- const isFollowing = user.following?.includes(targetId);
+ const isFollowing = useSocialStore.getState().following.includes(targetId);
```

For reactive component usage:

```diff
- const following = user.following ?? [];
+ const following = useSocialStore((s) => s.following);
```

### Why

The `following` field on the `User` object was originally populated during session hydration as a convenience. However, the social store is the single source of truth — it handles optimistic updates, rollbacks, and real-time sync. Reading from `user.following` can return stale data after follow/unfollow operations.

### Re-export aliases (convenience stores)

The following re-exports from `src/stores/films.ts` are migration convenience aliases and will be consolidated in a future version:

- `useLogStore` — alias for film log store
- `useWatchlistStore` — alias for watchlist store

These exist to reduce import churn during the migration period. New code should import directly from the canonical store locations.

### Timeline

1. **Current:** `@deprecated` JSDoc annotation added — IDE warnings on usage
2. **Next:** Gradual migration of consumers to `useSocialStore`
3. **Future:** Field type changed to `never` (compile error on access)
4. **Final:** Field removed from schema entirely
