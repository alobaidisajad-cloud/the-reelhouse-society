import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── Mock Supabase so tests never make real network calls ──
vi.mock('../supabaseClient', () => ({
    supabase: {
        from: () => ({
            select: () => ({ data: [], error: null }),
            insert: () => ({ data: [], error: null }),
            update: () => ({ data: [], error: null }),
            delete: () => ({ data: [], error: null }),
            upsert: () => ({ data: [], error: null }),
            eq: () => ({ data: [], error: null }),
        }),
        auth: {
            getSession: () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signOut: vi.fn(),
        },
        channel: () => ({
            on: () => ({ subscribe: vi.fn() }),
        }),
    },
    isSupabaseConfigured: true,
}))
