/**
 * featureFlags — Config-driven feature flag system.
 * ─────────────────────────────────────────────────────────────────────
 * Replaces hardcoded isAuteur / isPremium checks scattered across
 * the codebase with a centralized, composable flag resolution system.
 *
 * Resolution order: server override → role-based default → static default.
 * Future: Supabase `feature_flags` table for remote config + A/B testing.
 *
 * Usage:
 *   import { useFeatureFlag, isFeatureEnabled } from '@/src/lib/featureFlags';
 *
 *   // In components (reactive):
 *   const canAccessPhysicalArchive = useFeatureFlag('physical_archive');
 *
 *   // In services (non-reactive):
 *   if (isFeatureEnabled('editorial_desk')) { ... }
 */

import { useAuthStore } from '@/src/stores/auth';
import { resolveTier } from '@/src/utils/tier';

// ── Flag Definitions ──

export type FeatureFlagKey =
  | 'physical_archive'
  | 'editorial_desk'
  | 'lounge'
  | 'dispatch_compose'
  | 'oracle_ai'
  | 'weekly_challenge'
  | 'year_in_cinema'
  | 'tribunal'
  | 'advanced_stats';

interface FlagConfig {
  /** Human-readable description */
  description: string;
  /** Default enabled state when no role/server override applies */
  defaultEnabled: boolean;
  /** Roles that have this flag enabled by default */
  enabledForRoles: readonly string[];
}

const FLAG_REGISTRY: Record<FeatureFlagKey, FlagConfig> = {
  physical_archive: {
    description: 'Access to the Physical Archive collection tracking',
    defaultEnabled: false,
    enabledForRoles: ['archivist', 'auteur'],
  },
  editorial_desk: {
    description: 'Access to The Editorial Desk — curated dispatches',
    defaultEnabled: false,
    enabledForRoles: ['archivist', 'auteur'],
  },
  lounge: {
    description: 'Access to The Lounge — real-time chat rooms',
    defaultEnabled: false,
    enabledForRoles: ['archivist', 'auteur'],
  },
  dispatch_compose: {
    description: 'Ability to compose and publish dispatches',
    defaultEnabled: false,
    enabledForRoles: ['auteur'],
  },
  oracle_ai: {
    description: 'Access to the Oracle AI film recommendation engine',
    defaultEnabled: false,
    enabledForRoles: ['archivist', 'auteur'],
  },
  weekly_challenge: {
    description: 'Weekly film challenge participation',
    defaultEnabled: true,
    enabledForRoles: ['cinephile', 'archivist', 'auteur'],
  },
  year_in_cinema: {
    description: 'Year in Cinema retrospective feature',
    defaultEnabled: true,
    enabledForRoles: ['cinephile', 'archivist', 'auteur'],
  },
  tribunal: {
    description: 'Access to The Tribunal — community moderation',
    defaultEnabled: false,
    enabledForRoles: ['auteur'],
  },
  advanced_stats: {
    description: 'Advanced statistics and radar breakdowns',
    defaultEnabled: false,
    enabledForRoles: ['auteur'],
  },
};

// ── Server Overrides (future: populated from Supabase) ──

let serverOverrides: Partial<Record<FeatureFlagKey, boolean>> = {};

/**
 * Set server-side flag overrides (e.g., from Supabase `feature_flags` table).
 * Called once during app boot when remote config is available.
 */
export function setServerOverrides(overrides: Partial<Record<FeatureFlagKey, boolean>>): void {
  serverOverrides = { ...overrides };
}

// ── Resolution ──

/**
 * Check if a feature flag is enabled for the current user.
 * Resolution: server override → role-based default → static default.
 */
export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  // 1. Server override takes highest priority
  if (key in serverOverrides) {
    return serverOverrides[key]!;
  }

  // 2. Role-based resolution
  const flag = FLAG_REGISTRY[key];
  if (!flag) return false;

  const userRole = resolveTier(useAuthStore.getState().user);
  if (flag.enabledForRoles.includes(userRole)) {
    return true;
  }

  // 3. Static default
  return flag.defaultEnabled;
}

/**
 * React hook for reactive feature flag checking.
 * Re-renders when the user's role changes (e.g., after subscription upgrade).
 */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const userRole = useAuthStore((s) => resolveTier(s.user));

  // Server override
  if (key in serverOverrides) {
    return serverOverrides[key]!;
  }

  const flag = FLAG_REGISTRY[key];
  if (!flag) return false;

  // Role-based
  if (flag.enabledForRoles.includes(userRole)) {
    return true;
  }

  return flag.defaultEnabled;
}

/**
 * Get the full flag registry for debugging/admin panels.
 */
export function getAllFlags(): Record<FeatureFlagKey, FlagConfig & { enabled: boolean }> {
  const result = {} as Record<FeatureFlagKey, FlagConfig & { enabled: boolean }>;
  for (const [key, config] of Object.entries(FLAG_REGISTRY)) {
    result[key as FeatureFlagKey] = {
      ...config,
      enabled: isFeatureEnabled(key as FeatureFlagKey),
    };
  }
  return result;
}
