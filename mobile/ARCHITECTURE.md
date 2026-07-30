# ReelHouse Mobile — Architecture Guide

> **Last updated:** 2026-05-22 | **Stack:** Expo 54, React 19.1, RN 0.81, TypeScript Strict

---

## Folder Convention

```
app/                          # Expo Router file-based routes
  (tabs)/                     # Bottom tab navigator
  (modals)/                   # Modal stack screens
  film/[id].tsx               # Film detail (dynamic route)

src/
  components/                 # Shared UI components (pure, stateless)
    auth/                     # Auth-related (AuthGuard, EmailConfirmation)
    darkroom/                 # Darkroom discovery engine
    lounge/                   # Lounge chat UI
    log/                      # Film logging flow
    profile/                  # Profile display components
    theme/                    # Design system elements (CrestGlow, etc.)

  features/                   # Feature-scoped modules (stateful, screen-aware)
    profile/                  # Edit profile, links editor
    settings/                 # Settings screen, sections, data vault

  services/                   # Supabase data access layer (CQRS reads)
  stores/                     # Zustand state stores (CQRS writes + cache)
    domain/                   # Domain-specific slices (social, interaction, list)

  hooks/                      # Custom React hooks
  lib/                        # SDK wrappers (Sentry, Supabase, RevenueCat)
  utils/                      # Pure utility functions
  schemas/                    # Zod validation schemas
  types.ts                    # Shared type definitions
  theme/                      # Design tokens (colors, fonts, effects)
  constants/                  # App constants, limits, deep links
  assets/                     # Static assets (logo SVG data)
```

### Convention: components/ vs features/

| Criteria | components/ | features/ |
|----------|-------------|-----------|
| State | Props-only or shared store | Feature-specific state |
| Reusability | Used by 2+ screens | Tied to 1 screen/flow |
| Imports | Theme, utils | Services, stores, schemas |
| Example | PressableScale, SkeletonPulse | SettingsScreen, EditProfileScreen |

---

## State Management (CQRS Pattern)

- **Reads:** TanStack Query v5 with staleTime, background refetch, MMKV persistence
- **Writes:** Zustand stores -> Supabase mutations -> query invalidation
- **Offline:** Mutation queue in MMKV with circuit breaker + exponential backoff

---

## Error Pipeline

1. Service throws (Supabase / network / timeout)
2. AppError (typed: timeout | network | validation | auth)
3. useQuery/useMutation error handler
4. reelToast.error() (user-visible) + captureError() (Sentry, production only)

### Resilience Layers

| Layer | File | Pattern |
|-------|------|---------|
| Request timeout | withTimeout.ts | AbortSignal.timeout(15s) |
| Request cancellation | withAbortSignal.ts | Screen-scoped AbortController |
| Write circuit breaker | offlineQueue.ts | 5 failures OPEN 30s cooldown |
| Memory pressure | memoryManager.ts | Hermes GC hooks + cache eviction |
| Unhandled rejections | AppBootstrapper.tsx | Global handler to Sentry |
| Crash recovery | ErrorBoundary.tsx | SafeMode: 3 retries then data wipe |
| Nav state snapshot | navigationSnapshot.ts | MMKV save/restore on background |

---

## Performance Architecture

| Feature | Implementation |
|---------|---------------|
| React Compiler | Enabled (app.json: experiments.reactCompiler: true) |
| Virtualized Lists | 100% FlashList (except DraggableFlatList) |
| Image Caching | expo-image with memory-disk + blurhash placeholders |
| Animation | Reanimated 4 worklets (native thread) |
| Prefetching | onPressIn poster prefetch + staggered batch |
| Skeleton Screens | FilmHeroSkeleton, SocialPulseSkeleton, SkeletonShimmer |
| New Architecture | Fabric + TurboModules (RN 0.81) |
| Sentry Performance | Route-aware TTID/TTFD + app start + frame tracking |

---

## Feature Flags

> Not yet implemented. The intended resolution order is: server override → role-based
> default → static default. (There is no `src/lib/featureFlags.ts` today; tier gating
> currently lives in `src/utils/tier.ts`.) Remove this section or add the module when built.

---

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | PascalCase | ProfileTriptych.tsx |
| Hooks | camelCase with use | useLogFlow.ts |
| Services | PascalCase + Service | LoungeService.ts |
| Stores | camelCase + Store | followStore.ts |
| Schemas | camelCase + .schema.ts | dossier.schema.ts |
| Utils | camelCase | withTimeout.ts |
| Constants | SCREAMING_SNAKE | CACHE_MAX_AGE in limits.ts |
