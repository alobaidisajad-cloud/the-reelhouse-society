/**
 * Feature Flags — Simple, database-backed feature toggling.
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores flags in a Zustand store, seeded from Supabase `app_config` table.
 * Falls back to safe defaults if Supabase is unavailable.
 *
 * Usage:
 *   const virtualScrolling = useFeatureFlag('virtual_scrolling')
 *   if (virtualScrolling) { ... use new logic ... }
 *
 * Admin toggle:
 *   UPDATE app_config SET value = 'true' WHERE key = 'ff_virtual_scrolling';
 */

import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../supabaseClient'

// Default feature flag values — these are the safe fallbacks
const DEFAULT_FLAGS: Record<string, boolean> = {
    batch_reactions: true,       // Phase 2.1 — batch reaction loading
    virtual_scrolling: false,    // Phase 2.4 — virtual lists (disabled until validated)
    offline_queue: false,        // Phase 3.5 — offline mutation queueing
    strict_username: true,       // Phase 5.2 — strict username validation
    secure_invite_codes: false,  // Phase 5.3 — server-side invite validation
}

interface FeatureFlagState {
    flags: Record<string, boolean>
    loaded: boolean
    loadFlags: () => Promise<void>
}

export const useFeatureFlagStore = create<FeatureFlagState>((set) => ({
    flags: { ...DEFAULT_FLAGS },
    loaded: false,

    loadFlags: async () => {
        if (!isSupabaseConfigured) {
            set({ loaded: true })
            return
        }

        try {
            const { data, error } = await supabase
                .from('app_config')
                .select('key, value')
                .like('key', 'ff_%')

            if (error || !data) {
                set({ loaded: true })
                return
            }

            const dbFlags: Record<string, boolean> = {}
            for (const row of data) {
                const flagName = row.key.replace('ff_', '')
                dbFlags[flagName] = row.value === 'true' || row.value === '1'
            }

            set((state) => ({
                flags: { ...state.flags, ...dbFlags },
                loaded: true,
            }))
        } catch {
            // Non-critical — use defaults
            set({ loaded: true })
        }
    },
}))

/**
 * Hook to read a single feature flag value.
 * Returns the flag's boolean value, defaulting to false for unknown flags.
 */
export function useFeatureFlag(flagName: string): boolean {
    return useFeatureFlagStore((s) => s.flags[flagName] ?? false)
}
