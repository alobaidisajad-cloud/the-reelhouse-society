/**
 * sanitisationCallSites.test.ts — proving the sanitiser is actually CALLED
 * ────────────────────────────────────────────────────────────────────────
 * inputTrustBoundary.test.ts proves sanitizeInput works. That is not the same thing.
 *
 * This file exists because of a measured failure: after wiring the sanitiser into
 * listSlice, ProfileWriteService and reportStore, deleting all three calls left the
 * ENTIRE suite green — 1322 passing. Every fix in batch 14 could have been reverted
 * in one commit with CI applauding.
 *
 * Batch 14's DONE WHEN is "a hostile payload is rejected at every one of the four
 * entry points, EACH WITH ITS OWN TEST". These are those tests. Each drives the real
 * function and asserts on what was handed to the database.
 */

const HOSTILE_TITLE = 'Best of ‮1999⁦⁩';   // RLO + isolates
const HOSTILE_BIO = 'critic​‌‍ and ‮archivist';
const HOSTILE_DETAILS = 'they wrote ‮something⁩ vile';

// ── module mocks ──────────────────────────────────────────────────────────────
jest.mock('react-native', () => ({
  InteractionManager: { runAfterInteractions: jest.fn((cb: () => void) => cb()) },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
  Platform: { OS: 'ios', select: jest.fn((o: Record<string, unknown>) => o.ios) },
  NativeModules: {}, Alert: { alert: jest.fn() }, Linking: { openURL: jest.fn() },
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(), set: jest.fn(), delete: jest.fn(),
    contains: jest.fn(() => false), getAllKeys: jest.fn(() => []),
  })),
}));
jest.mock('../../stores/mmkv-storage', () => ({
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false), getAllKeys: jest.fn(() => []), clearAll: jest.fn() },
  zustandMMKVStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  createAsyncMMKVStorage: jest.fn(() => ({ getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() })),
  getSecureStorage: jest.fn().mockResolvedValue({ getString: jest.fn(), set: jest.fn(), delete: jest.fn(), contains: jest.fn(() => false) }),
}));

/** Captures whatever any code path hands to Supabase. */
const captured: { insert: any[]; update: any[]; rpc: any[]; upsert: any[] } = { insert: [], update: [], rpc: [], upsert: [] };

jest.mock('@/src/lib/supabase', () => {
  const chain: any = {
    select: jest.fn(() => chain), eq: jest.fn(() => chain), order: jest.fn(() => chain),
    limit: jest.fn(() => chain), single: jest.fn(async () => ({ data: null, error: null })),
    maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    then: undefined,
  };
  return {
    supabase: {
      from: jest.fn(() => ({
        ...chain,
        insert: jest.fn((payload: any) => { captured.insert.push(payload); return { ...chain, select: jest.fn(() => ({ single: jest.fn(async () => ({ data: null, error: null })) })) }; }),
        update: jest.fn((payload: any) => { captured.update.push(payload); return chain; }),
        upsert: jest.fn((payload: any) => { captured.upsert.push(payload); return { ...chain, select: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: { id: 'l1' }, error: null })) })) }; }),
      })),
      rpc: jest.fn(async (name: string, args: any) => { captured.rpc.push({ name, args }); return { data: null, error: null }; }),
      auth: {
        getSession: jest.fn(async () => ({ data: { session: { user: { id: 'u1' } } }, error: null })),
        getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })),
      },
    },
  };
});

jest.mock('../../stores/auth', () => ({
  useAuthStore: { getState: jest.fn(() => ({ user: { id: 'u1', username: 'cinephile' } })) },
}));
jest.mock('@/src/stores/blockStore', () => ({ useBlockStore: { getState: jest.fn(() => ({ blockUser: jest.fn() })) } }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) }));
jest.mock('@/src/utils/TactileEngine', () => ({ __esModule: true, default: { success: jest.fn(), mutate: jest.fn(), navigate: jest.fn() } }));
jest.mock('../reelToast', () => { const t: any = jest.fn(); t.error = jest.fn(); t.success = jest.fn(); t.info = jest.fn(); return { __esModule: true, default: t }; });
jest.mock('@/src/utils/reelToast', () => { const t: any = jest.fn(); t.error = jest.fn(); t.success = jest.fn(); t.info = jest.fn(); return { __esModule: true, default: t }; });

beforeEach(() => { captured.insert = []; captured.update = []; captured.rpc = []; captured.upsert = []; jest.clearAllMocks(); });

// ══════════════════════════════════════════════════════════════════════════════
// Entry point 1 & 2 — stack title and description  (#68)
// ══════════════════════════════════════════════════════════════════════════════
describe('createList / updateList', () => {
  it('never hands a bidi override to the database', async () => {
    const { useFilmStore } = require('../../stores/films');
    await useFilmStore.getState().createList({ title: HOSTILE_TITLE, description: HOSTILE_BIO });

    expect(captured.insert.length).toBeGreaterThan(0);
    const row = Array.isArray(captured.insert[0]) ? captured.insert[0][0] : captured.insert[0];
    expect(row.title).toBe('Best of 1999');
    expect(row.title).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(row.description).not.toMatch(/[​-‍‪-‮]/);
  });

  it('cleans an edit too, not just a create', async () => {
    const { useFilmStore } = require('../../stores/films');
    await useFilmStore.getState().updateList('list-1', { title: HOSTILE_TITLE });

    expect(captured.update.length).toBeGreaterThan(0);
    expect(captured.update[0].title).toBe('Best of 1999');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Entry point 3 — profile free text  (not in the register)
// ══════════════════════════════════════════════════════════════════════════════
describe('ProfileService.updateProfile', () => {
  it('cleans the bio before it reaches the profiles table', async () => {
    const { ProfileService } = require('../../services/ProfileWriteService');
    await ProfileService.updateProfile('u1', { bio: HOSTILE_BIO });

    expect(captured.update.length).toBeGreaterThan(0);
    expect(captured.update[0].bio).toBe('critic and archivist');
  });

  it('cleans display_name and persona as well', async () => {
    const { ProfileService } = require('../../services/ProfileWriteService');
    await ProfileService.updateProfile('u1', { display_name: 'The ‮Oracle', persona: 'a‌b' } as any);

    const row = captured.update[0];
    expect(row.display_name).toBe('The Oracle');
    expect(row.persona).toBe('ab');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Entry point 4 — moderation report details  (not in the register)
// ══════════════════════════════════════════════════════════════════════════════
describe('submitReport', () => {
  it('cleans the details a moderator will read', async () => {
    const { useReportStore } = require('../../stores/reportStore');
    await useReportStore.getState().submitReport({
      reporter_id: '11111111-1111-4111-8111-111111111111',
      content_id: '22222222-2222-4222-8222-222222222222',
      content_type: 'log',
      reason: 'spam',
      details: HOSTILE_DETAILS,
      target_user_id: '33333333-3333-4333-8333-333333333333',
    } as any);

    const call = captured.rpc.find(c => c.name === 'submit_report');
    expect(call).toBeDefined();
    expect(call.args.p_details).toBe('they wrote something vile');
    expect(call.args.p_details).not.toMatch(/[‪-‮⁦-⁩]/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Entry point 5 — dossier critique  (finding 104)
// ══════════════════════════════════════════════════════════════════════════════
describe('buildCritiquePayload', () => {
  const ctx = { id: 'd1', tempId: 't1', userId: 'u1', username: 'cinephile', avatarUrl: null };

  it('cleans the body that both the optimistic row and the insert use', () => {
    const { buildCritiquePayload } = require('../critiquePayload');
    const row = buildCritiquePayload('a ‮reversed⁩ critique', ctx);
    expect(row.body).toBe('a reversed critique');
    expect(row.body).not.toMatch(/[‪-‮⁦-⁩]/);
  });

  it('refuses a critique that is nothing but invisible characters', () => {
    const { buildCritiquePayload } = require('../critiquePayload');
    expect(buildCritiquePayload('‮⁦⁩​', ctx)).toBeNull();
    expect(buildCritiquePayload('   ', ctx)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// The offline last gate — a stack queued by the CURRENT TestFlight build
// ══════════════════════════════════════════════════════════════════════════════
// The queue persists in MMKV. Entries written by the build now on TestFlight carry
// unsanitised titles, and they flush AFTER the launch build lands. Cleaning at the
// enqueue source alone would miss exactly those.
describe('offline list handlers', () => {
  it('cleans a create queued before the fix existed', async () => {
    const { executeMutation } = require('../mutationExecutor');
    await executeMutation({ id: 'm1', type: 'create_list', timestamp: Date.now(),
      payload: { id: 'l1', user_id: 'u1', title: HOSTILE_TITLE, description: 'a\u200Bb' } } as any, {});

    const row = Array.isArray(captured.upsert[0]) ? captured.upsert[0][0] : captured.upsert[0];
    expect(row.title).toBe('Best of 1999');
    expect(row.description).toBe('ab');
  });

  it('cleans an edit queued before the fix existed', async () => {
    const { executeMutation } = require('../mutationExecutor');
    await executeMutation({ id: 'm2', type: 'update_list', timestamp: Date.now(),
      payload: { list_id: 'l1', user_id: 'u1', updates: { title: HOSTILE_TITLE } } } as any, {});

    expect(captured.update[0].title).toBe('Best of 1999');
  });
});
