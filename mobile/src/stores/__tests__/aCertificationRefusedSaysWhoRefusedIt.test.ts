/**
 * A CERTIFICATION REFUSED SAYS WHO REFUSED IT (review round 9, interactionSlice).
 *
 * The house keeps a certification two ways, both 42501: the author's own rule (their
 * privacy_endorsements, interactions_endorse_gate, a row-level policy) and the member's own
 * standing (silenced, suspended). Each said "Failed to certify entry." and went to Sentry as a
 * defect. Now the author's rule is said as theirs, the standing in the house's own words, and
 * neither is reported; any other failure is said and reported as before. Against the house as
 * strict as it is (test-utils/supabaseFake).
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { captureError } from '@/src/lib/sentry';
import reelToast from '@/src/utils/reelToast';
import { useAuthStore } from '@/src/stores/auth';
import { useLogStore } from '@/src/stores/films';

let mockHouse = supabaseFake();
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  Object.assign(fn, { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const LIST_ID = '55555555-5555-4555-8555-555555555555';

const OWNERS_RULE = { code: '42501', message: 'new row violates row-level security policy for table "interactions"' };
const SILENCED = { code: '42501', message: 'Your account has been silenced by The Society.' };
const SUSPENDED = { code: '42501', message: 'Your account is suspended until 30 Nov 2026 12:00 UTC.' };
const DEFECT = { code: '23514', message: 'new row for relation "interactions" violates check constraint' };

const errors = () => (reelToast as unknown as { error: jest.Mock }).error.mock.calls.map(([m]) => m);
const refusedWith = (failure: { code: string; message: string }) => {
  mockHouse = supabaseFake({ rows: { interactions: [] }, fail: { interactions: failure } });
};
const certifyLog = async () => { try { await useLogStore.getState().toggleEndorse(LOG_ID); } catch { /* thrown for the caller's rollback */ } };
const certifyList = async () => { try { await useLogStore.getState().toggleListEndorse(LIST_ID); } catch { /* thrown for the caller's rollback */ } };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'cinephile', role: 'cinephile' } as never, isAuthenticated: true } as never);
  useLogStore.setState({ interactions: [], _endorsedIndex: {}, _listEndorsedIndex: {} } as never);
});
afterEach(() => {
  useLogStore.setState({ interactions: [], _endorsedIndex: {}, _listEndorsedIndex: {} } as never);
});

describe('a record’s certification refused', () => {
  it('by the author’s rule: says the author limits who may certify, is taken back, and is no defect; another failure keeps the old words and is reported', async () => {
    refusedWith(OWNERS_RULE);
    await certifyLog();
    expect(errors()).toEqual(['This member limits who may certify their work.']);
    expect(useLogStore.getState()._endorsedIndex[LOG_ID]).toBeUndefined();
    expect(captureError).not.toHaveBeenCalled();

    refusedWith(DEFECT);
    await certifyLog();
    expect(errors()).toEqual(['This member limits who may certify their work.', 'Failed to certify entry.']);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it('for a silenced member: says the house silenced them, never the author’s rule', async () => {
    refusedWith(SILENCED);
    await certifyLog();
    expect(errors()).toEqual(['Your account has been silenced by The Society.']);
    expect(captureError).not.toHaveBeenCalled();
  });

  it('for a suspended member: says until when', async () => {
    refusedWith(SUSPENDED);
    await certifyLog();
    expect(errors()).toEqual(['Your account is suspended until 30 Nov 2026 12:00 UTC.']);
  });
});

describe('a stack’s certification refused', () => {
  it('by the maker’s rule: says the maker limits who may certify, is taken back, and is no defect; another failure keeps the old words and is reported', async () => {
    refusedWith(OWNERS_RULE);
    await certifyList();
    expect(errors()).toEqual(['This member limits who may certify their work.']);
    expect(useLogStore.getState()._listEndorsedIndex[LIST_ID]).toBeUndefined();
    expect(captureError).not.toHaveBeenCalled();

    refusedWith(DEFECT);
    await certifyList();
    expect(errors()).toEqual(['This member limits who may certify their work.', 'Failed to certify list.']);
    expect(captureError).toHaveBeenCalledTimes(1);
  });

  it('for a suspended member: says until when, never the maker’s rule', async () => {
    refusedWith(SUSPENDED);
    await certifyList();
    expect(errors()).toEqual(['Your account is suspended until 30 Nov 2026 12:00 UTC.']);
    expect(captureError).not.toHaveBeenCalled();
  });
});
