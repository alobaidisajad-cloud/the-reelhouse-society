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

# 3. Start the development server
npx expo start
```

Scan the QR code with Expo Go, or press `a` / `i` for emulator.

---

## Development Rules

### Code Quality
- TypeScript strict mode is enforced (`strict: true`)
- ESLint with `@typescript-eslint/no-floating-promises` — all async calls must be awaited or explicitly voided
- `@typescript-eslint/no-explicit-any` is a warning — prefer `unknown` with type narrowing
- Complexity limit: 15 (stores: 20) — extract helpers if exceeded

### Testing
- **Stores**: Property-based tests (fast-check) for invariants
- **Hooks**: Behavioral tests with `@testing-library/react-native`
- **Components**: Interaction tests (press, input, assert visible)
- **Services**: Unit tests with mocked Supabase
- Coverage enforced in CI — never drops below baseline

### Accessibility
- All interactive elements (PressableScale, buttons) require `accessibilityLabel`
- All modals must include `accessibilityViewIsModal={true}` on the content wrapper
- Use `useReducedMotion()` to gate animations
- After successful mutations, call `AccessibilityInfo.announceForAccessibility()`

### Date Formatting
- Use `formatDate()`, `formatDateMonthYear()`, or `formatTMDBDate()` from `src/utils/timeAgo.ts`
- Never use inline `toLocaleDateString()` in components

---

## PR Checklist

- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npx tsc --noEmit`
- [ ] ESLint clean: `npx eslint .`
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
