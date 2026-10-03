# The ReelHouse Society — Mobile

A premium mobile film-tracking and social-cinema app built with Expo, React Native, and TypeScript. Designed around the **Nitrate Noir** design system — dark, cinematic, and intentionally crafted for film lovers who treat cinema as culture.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo 54 (Managed Workflow) |
| UI | React 19.1 · React Native 0.81 |
| Language | TypeScript (strict) |
| Auth & Database | Supabase (Auth + Postgres + Realtime) |
| State | Zustand stores · TanStack Query v5 |
| Offline persistence | MMKV |
| Animations | Reanimated 4 |
| Navigation | Expo Router (file-based routing) |

---

## Quick Start

```bash
# Install dependencies
npm install

# Build and open the development app (iOS / Android)
npm run ios
npm run android
```

A development build, not Expo Go: the app's native modules (MMKV, Skia,
RevenueCat) do not run in Expo Go. After the first build, `npm start` serves it.

---

## Project Structure

```
app/          # Expo Router file-based routes
src/
  components/ # Shared UI
  features/   # Screen-scoped modules (stateful)
  services/   # Supabase data access
  stores/     # Zustand stores
  hooks/      # Custom React hooks
  lib/        # SDK wrappers (Sentry, Supabase, RevenueCat)
  theme/      # Design tokens (colors, fonts, effects)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for deep technical documentation.

---

## License

Proprietary — The ReelHouse Society © 2026
