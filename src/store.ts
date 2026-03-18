/**
 * ReelHouse Store Barrel
 * ─────────────────────────────────────────────────────────────────────────────
 * This file re-exports all stores from their domain modules.
 * All existing imports like `import { useAuthStore } from '../store'` continue
 * to work unchanged — this file is a backwards-compatible forwarding layer.
 *
 * Domain modules:
 *   stores/auth.js      — useAuthStore (login, signup, logout, follow)
 *   stores/films.js     — useFilmStore (logs, watchlist, vault, lists)
 *   stores/venue.js     — useVenueStore, useCinemaReviewStore
 *   stores/ui.js        — useUIStore, useDiscoverStore
 *   stores/social.js    — useNotificationStore
 *   stores/content.js   — useDispatchStore, useProgrammeStore
 *   stores/realtime.js  — initAuthSync, initRealtime
 */

export { useAuthStore } from './stores/auth'
export { useFilmStore } from './stores/films'
export { useVenueStore, useCinemaReviewStore } from './stores/venue'
export { useUIStore, useDiscoverStore } from './stores/ui'
export { useNotificationStore } from './stores/social'
export { useDispatchStore, useProgrammeStore } from './stores/content'
export { initAuthSync, initRealtime } from './stores/realtime'
