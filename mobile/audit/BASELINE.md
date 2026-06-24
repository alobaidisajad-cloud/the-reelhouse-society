# Audit Baseline — Tooling Evidence

> Captured 2026-06-24 at audit start. Read-only; no source modified.

## Stack
- Expo 54 / React 19.1.0 / React Native 0.81.5 / TypeScript 5.9 (strict)
- Routing: expo-router 6 (file-based, route groups)
- State: Zustand 5 (writes) + TanStack Query 5 (reads) + MMKV persistence
- Backend: Supabase (`@supabase/supabase-js` 2.102), edge functions in `supabase/`
- Payments: RevenueCat (`react-native-purchases` 10)
- Monitoring: Sentry (`@sentry/react-native` 7.2)
- Animation/graphics: Reanimated 4, Skia, react-native-svg
- Validation: Zod 4
- Tests: Jest (jest-expo) + @testing-library/react-native; fast-check (property tests); Maestro (e2e)

## Type check
`npx tsc --noEmit -p tsconfig.json` → **EXIT 0 (clean)**. Strict mode on.
Note: tsconfig excludes `__tests__`, `jest.setup.ts`, `supabase/**` from typecheck.

## Lint
`npx eslint .` → **EXIT 0 — 0 errors, 18 warnings.**
Warnings breakdown:
- `import/first` ordering warnings in `src/components/home/MarqueeBoard.tsx`, `src/components/profile/TasteDNA.tsx`, `src/lib/__tests__/tmdb.test.ts` (cosmetic; modules with deliberate post-import code).
- 1 "Unused eslint-disable directive" in `src/components/profile/ProfileTriptych.tsx:8` (stale directive — LOW).

## Test coverage baseline (`.coverage-baseline.json`)
- Lines: 19.05% · Branches: 13.97% · Functions: 15.86% · Statements: 18.11%
- A coverage ratchet script exists (`scripts/coverage-ratchet.js`) — coverage is gated to not regress, but absolute coverage is low. Test LOC (~15.6k) is concentrated on the resilience/store core, not UI.

## CI
- `.github/workflows/ci.yml` present (to be reviewed in infra pass).

## Prior audit
- `PERFECTION_AUDIT.md` (85KB) exists from a previous pass. Treated as cross-reference only; all findings independently verified against current code.
