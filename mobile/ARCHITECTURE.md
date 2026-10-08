# ReelHouse Mobile — Architecture Guide

> **Last read against the code:** 2026-10-03 | **Stack:** Expo 54, React 19.1, RN 0.81, TypeScript Strict

---

## Folder Convention

```
app/                          # Expo Router file-based routes
  (tabs)/                     # Bottom tab navigator
  (modals)/                   # Modal stack screens
  film/[id].tsx               # Film detail (dynamic route)

src/
  components/                 # Shared UI components
    auth/                     # Sign-in, recovery, email confirmation
    darkroom/                 # Darkroom discovery engine
    lounge/                   # Lounge chat UI
    log/                      # Film logging flow
    profile/                  # Profile display components
    theme/                    # Design system elements (CrestGlow, etc.)

  features/                   # Feature-scoped modules (stateful, screen-aware)
    archive/                  # Importing and exporting a member's archive
    profile/                  # Edit profile, links editor
    settings/                 # Settings screen, sections, data vault

  services/                   # Supabase data access: what a screen reads and writes
  stores/                     # Zustand stores: the state a room owns, read and written
    domain/                   # Domain-specific slices (social, interaction, list)

  hooks/                      # Custom React hooks
  lib/                        # SDK wrappers (Sentry, Supabase, RevenueCat)
  utils/                      # Pure utility functions
  schemas/                    # Zod validation schemas
  types/                      # Shared type definitions
  theme/                      # Design tokens (colors, fonts, effects)
  constants/                  # App constants, limits, deep links
```

### Convention: components/ vs features/

| Criteria | components/ | features/ |
|----------|-------------|-----------|
| State | Props-only or shared store | Feature-specific state |
| Reusability | Used by 2+ screens | Tied to 1 screen/flow |
| Imports | Theme, utils | Services, stores, schemas |
| Example | PressableScale, ToastHost | SettingsScreen, EditProfileScreen |

---

## State Management

- **Reads:** TanStack Query v5 for most screens (staleTime, background refetch, the
  cache persisted in MMKV); the Lounge, the Dispatch and the notices keep their
  state in Zustand stores, which read it themselves
- **Writes:** Zustand stores -> Supabase mutations -> query invalidation
- **Offline:** a write made offline is queued in MMKV and sent, in order, when the
  connection returns (offlineQueue.ts)

---

## Error Pipeline

1. supabase-js RESOLVES a failure as `{ error }`, so every call reads it and throws;
   a timeout throws `AppError` ('TIMEOUT', withTimeout.ts)
2. A read that failed is drawn as failed — EmptyOffline / TryAgain — never as an
   empty or "not found" page
3. A write that failed is undone on screen and said (reelToast); offline, it is queued
4. captureError() sends Sentry what is not a network failure

### Resilience Layers

| Layer | File | Pattern |
|-------|------|---------|
| Request timeout | withTimeout.ts | AbortSignal.timeout(15s) |
| Request cancellation | withAbortSignal.ts | Screen-scoped AbortController |
| Offline writes | offlineQueue.ts | Kept on the phone, sent in order; a server blip retried up to five sends, then dead-lettered |
| Memory pressure | memoryManager.ts | Hermes GC hooks + cache eviction |
| Unhandled rejections | sentry.ts | Sentry's own integration (Hermes' rejection tracker) |
| Crash recovery | RouteErrorBoundary.tsx, ErrorBoundary.tsx | A route's crash keeps the rest of the app; the app-wide net retries 3 times, then asks for a restart |

---

## Performance Architecture

| Feature | Implementation |
|---------|---------------|
| Virtualized Lists | 100% FlashList (except DraggableFlatList) |
| Image Caching | expo-image with memory-disk caching |
| Gradients | Native `experimental_backgroundImage`, never a gradient-only SVG (an SVG is a bitmap the size of its view): `src/theme/__tests__/aGradientIsNeverABitmap.guard.test.ts` |
| Animation | Reanimated 4 worklets (native thread) |
| Prefetching | Only where a screen is about to draw the picture, at the size it draws it (profile tabs, the Stacks); never at start-up. The list is `src/utils/__tests__/imagePrefetchSites.guard.test.ts` |
| Loading States | FilmHeroSkeleton, RoomRetrieving |
| New Architecture | Fabric + TurboModules (RN 0.81) |
| Sentry Performance | Route-aware TTID/TTFD + app start + frame tracking |

---

## Gating

There are no feature flags. What a rank may do is decided in one place:
`useClearance` (src/hooks/useClearance.ts) is the only gate, and every refusal
says why and how to get through.

---

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | PascalCase | ProfileTriptych.tsx |
| Hooks | camelCase with use | useLogFlow.ts |
| Services | PascalCase + Service | LoungeService.ts |
| Stores | camelCase + Store | followStore.ts |
| Schemas | camelCase + `schema` | film.schema.ts |
| Utils | camelCase | withTimeout.ts |
| Constants | SCREAMING_SNAKE | CACHE_KEYS in cacheKeys.ts |
