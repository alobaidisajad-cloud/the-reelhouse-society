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
| State (writes) | Zustand (CQRS pattern) |
| State (reads) | TanStack Query v5 |
| Offline persistence | MMKV |
| Animations | Reanimated 3 |
| Navigation | Expo Router (file-based routing) |

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server
npx expo start
```

Scan the QR code with Expo Go, or press `i` / `a` to open in a simulator.

---

## Project Structure

```
app/          # Expo Router file-based routes
src/
  components/ # Shared UI (pure, stateless)
  features/   # Screen-scoped modules (stateful)
  services/   # Supabase data access (CQRS reads)
  stores/     # Zustand stores (CQRS writes)
  hooks/      # Custom React hooks
  lib/        # SDK wrappers (Sentry, Supabase, RevenueCat)
  theme/      # Design tokens (colors, fonts, effects)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for deep technical documentation.

---

## License

Proprietary — The ReelHouse Society © 2026
