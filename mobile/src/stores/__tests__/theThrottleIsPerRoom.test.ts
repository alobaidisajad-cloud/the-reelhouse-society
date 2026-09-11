/**
 * theThrottleIsPerRoom.test.ts — sharing an essay into two salons.
 * ─────────────────────────────────────────────────────────────────────────────
 * The send throttle was one module-level number counting the last send
 * ANYWHERE. It exists to swallow a double-tap in a room, and it did — but it
 * also swallowed the deliberate act the share sheet is built for: sending an
 * essay into one salon and then into another within 800ms. The second returned
 * false and vanished.
 *
 * Silently, which is what made it invisible. Of the paths in `sendMessage` that
 * return false, the throttle is the only one that raises no toast — correctly,
 * because a swallowed double-tap should say nothing. So the member shared into
 * two rooms, the sheet closed twice, and one share simply never happened.
 *
 * An essay is shared into a room, so this is the Dispatch path.
 */
import { useLoungeStore } from '../lounge';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';

const mockFrom = jest.fn();
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), rpc: jest.fn(), channel: jest.fn() },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: U1, username: 'testuser' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const chain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['insert', 'upsert', 'update', 'delete', 'select', 'eq', 'in', 'order', 'limit'] as const) {
    c[f] = () => self();
  }
  c.single = async () => nextResult;
  c.maybeSingle = async () => nextResult;
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(nextResult).then(res);
  return c;
};

/**
 * The throttle's memory is module-level, so it SURVIVES between tests in this
 * file: without this, the first test's send to room A still throttles the
 * second test's, and the second test fails for a reason that has nothing to do
 * with the code under test. Each test therefore starts ten seconds after the
 * last one, which is the same thing a real member's clock does.
 */
let clock = Date.now();
let clockSpy: jest.SpyInstance;

beforeEach(() => {
  clock += 10_000;
  clockSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  mockFrom.mockReset().mockImplementation(() => chain());
  nextResult = {
    data: { id: '99999999-9999-4999-8999-999999999999', created_at: '2026-09-11T12:00:00Z' },
    error: null,
  };
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: null, sending: false,
    members: {}, loading: false, typingUsers: [],
  } as never);
});

afterEach(() => { clockSpy.mockRestore(); });

describe('the send throttle', () => {
  it('lets an essay reach a SECOND salon immediately after the first', async () => {
    // The act the share sheet exists for. Under one global counter the second
    // of these returned false and the member was never told.
    useLoungeStore.setState({ currentLoungeId: A } as never);
    const first = await useLoungeStore.getState().sendMessage(A, 'An essay.', 'dossier_share', {});

    useLoungeStore.setState({ currentLoungeId: B } as never);
    const second = await useLoungeStore.getState().sendMessage(B, 'An essay.', 'dossier_share', {});

    expect(`salonA=${first} salonB=${second}`).toBe('salonA=true salonB=true');
  });

  it('STILL swallows a double-tap into the same room', async () => {
    // The behaviour the throttle was written for, unchanged.
    useLoungeStore.setState({ currentLoungeId: A } as never);
    const first = await useLoungeStore.getState().sendMessage(A, 'One.');
    const second = await useLoungeStore.getState().sendMessage(A, 'One.');

    expect(`first=${first} second=${second}`).toBe('first=true second=false');
  });

  it('lets the same room through again once the window has passed', async () => {
    useLoungeStore.setState({ currentLoungeId: A } as never);
    await useLoungeStore.getState().sendMessage(A, 'One.');

    // Push this test's own clock past the window.
    clock += 5_000;
    expect(await useLoungeStore.getState().sendMessage(A, 'Two.')).toBe(true);
  });
});
