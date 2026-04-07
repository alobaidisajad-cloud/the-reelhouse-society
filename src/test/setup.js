import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── Mock idb-keyval (IndexedDB) — jsdom doesn't support IndexedDB ──
vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock Supabase so tests never make real network calls ──
// Every method returns a chainable object that resolves to { data, error: null }
const chainable = () => {
    const obj = { data: [], error: null, count: null }
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq',
        'gt', 'lt', 'gte', 'lte', 'in', 'is', 'order', 'limit', 'range',
        'single', 'maybeSingle', 'filter', 'match', 'not', 'or', 'contains',
        'textSearch', 'ilike', 'like']
    methods.forEach(m => { obj[m] = () => obj })
    // Make it thenable so await works
    obj.then = (resolve) => resolve({ data: [], error: null })
    return obj
}

vi.mock('../supabaseClient', () => ({
    supabase: {
        from: () => chainable(),
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signOut: vi.fn().mockResolvedValue({ error: null }),
        },
        channel: () => ({
            on: () => ({ on: () => ({ subscribe: vi.fn() }), subscribe: vi.fn() }),
            subscribe: vi.fn(),
        }),
        removeChannel: vi.fn(),
        rpc: () => Promise.resolve({ data: null, error: null }),
    },
    isSupabaseConfigured: true,
}))


Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
})
