/**
 * ReelHouse Shared Constants — Nitrate Noir Theme Tokens
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for animation configs, timing, limits, and
 * breakpoints used across the app. Centralizes values that were previously
 * scattered as inline magic numbers.
 */

// ── Animation Presets ──────────────────────────────────────────────────────
export const ANIMATION = {
    /** Standard spring — used for modal cards, tooltips, dropdowns */
    spring: { type: 'spring' as const, damping: 25, stiffness: 300 },
    /** Snappy spring — used for buttons, reaction pills */
    springSnappy: { type: 'spring' as const, damping: 10, stiffness: 400 },
    /** Relaxed spring — used for page transitions, large elements */
    springRelaxed: { type: 'spring' as const, damping: 28, stiffness: 320 },
    /** Standard fade duration */
    fadeDuration: 0.2,
} as const

// ── Operational Limits ─────────────────────────────────────────────────────
export const LIMITS = {
    /** Max notifications stored in local state */
    MAX_NOTIFICATIONS: 50,
    /** Default debounce for TMDB search (ms) */
    SEARCH_DEBOUNCE_MS: 400,
    /** Min characters before triggering search */
    SEARCH_MIN_LENGTH: 2,
    /** Action throttle cooldown (ms) — prevents reaction spam */
    ACTION_THROTTLE_MS: 2000,
    /** Max items per page for paginated queries */
    PAGE_SIZE: 20,
    /** Max CSV import batch size per insert */
    CSV_BATCH_SIZE: 50,
    /** Max image cache entries in ServiceWorker */
    SW_IMAGE_CACHE_MAX: 500,
    /** Max file size for avatar uploads (bytes) — 5MB */
    AVATAR_MAX_SIZE: 5 * 1024 * 1024,
    /** Username length constraints */
    USERNAME_MIN: 3,
    USERNAME_MAX: 30,
} as const

// ── Breakpoints ────────────────────────────────────────────────────────────
export const BREAKPOINTS = {
    /** Mobile portrait max-width */
    MOBILE: 600,
    /** Tablet max-width */
    TABLET: 900,
    /** Desktop min-width */
    DESKTOP: 901,
} as const

// ── Supabase Table Names ───────────────────────────────────────────────────
export const TABLES = {
    PROFILES: 'profiles',
    LOGS: 'logs',
    LISTS: 'lists',
    LIST_ITEMS: 'list_items',
    INTERACTIONS: 'interactions',
    NOTIFICATIONS: 'notifications',
    LOUNGES: 'lounges',
    LOUNGE_MEMBERS: 'lounge_members',
    LOUNGE_MESSAGES: 'lounge_messages',
    DOSSIERS: 'dossiers',
    PROGRAMMES: 'programmes',
    APP_CONFIG: 'app_config',
} as const

// ── Error Messages ─────────────────────────────────────────────────────────
export const ERRORS = {
    OFFLINE: 'You are currently offline. Changes will sync when connection returns.',
    RATE_LIMITED: 'Slow down — please wait a moment before trying again.',
    AUTH_REQUIRED: 'You must be signed in to perform this action.',
    BANNED: 'Your account has been suspended.',
} as const
