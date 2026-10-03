# Contributing to ReelHouse Mobile

> The Society welcomes new members. Follow these guidelines to keep the archive pristine.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env
# Fill in real values (Supabase, RevenueCat, Sentry)

# 3. Build and open the development app
npm run ios        # or: npm run android
```

A development build, not Expo Go: MMKV, Skia and RevenueCat are native modules.

---

## Development Rules

### Code Quality
- TypeScript strict mode is enforced (`strict: true`)
- ESLint (eslint.config.js), zero warnings in CI: Text and TextInput come from
  `@/src/components/text`, never React Native; no `Intl` or `toLocale…String`
  (the phone's Hermes has no polyfill: dates come from src/utils/timeAgo.ts); no
  flash-list `AnimatedFlashList` (use CinematicFlashList)
- A comment names only what exists (`npm run comments:check`, gated in CI)

### Testing
- **Stores**: Property-based tests (fast-check) for invariants
- **Hooks**: Behavioral tests with `@testing-library/react-native`
- **Components**: Interaction tests (press, input, assert visible)
- **Services**: Unit tests with mocked Supabase
- Coverage enforced in CI — never drops below baseline

### Accessibility
- All interactive elements (PressableScale, buttons) require `accessibilityLabel`
- A `<Modal>` is its own window: a screen reader stays inside it. An overlay drawn
  inside the screen instead (a tray, a sheet) must say it is modal itself:
  `accessibilityViewIsModal` for VoiceOver, and the page beneath
  `importantForAccessibility="no-hide-descendants"` for TalkBack (FilmActionTray)
- Use Reanimated's `useReducedMotion()` to gate animations: it knows the setting on the first frame
- A toast is spoken (toastBus.ts on iOS, a live region on Android). A write whose
  success shows no toast says it with `AccessibilityInfo.announceForAccessibility()`;
  one that does show a toast never announces too

### Date Formatting
- Use `formatDate()`, `formatDateMonthYear()`, or `formatTMDBDate()` from `src/utils/timeAgo.ts`
- Never use inline `toLocaleDateString()` in components

---

## PR Checklist

- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] ESLint clean: `npx eslint . --max-warnings=0`
- [ ] Comments true: `npm run comments:check -- --kinds NAME,FILE,LINE`
- [ ] Coverage doesn't regress (CI enforces this)
- [ ] No new `as any` without a justifying comment
- [ ] Accessibility labels on all new pressable elements
- [ ] New hooks have a corresponding test file

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical guide.
See [docs/adr/](./docs/adr/) for design decision records.

---

## Commit Convention

Use descriptive commit messages. Reference audit fix IDs when applicable:
```
feat: Add cursor pagination to dossier feed (T0-2 FIX)
fix: Prevent cross-user mutation execution (P0 SECURITY FIX)
test: Add property-based tests for block store
```
