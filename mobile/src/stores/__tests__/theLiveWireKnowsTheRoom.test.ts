/**
 * theLiveWireKnowsTheRoom.test.ts — a dispatch arriving into the wrong room.
 * ─────────────────────────────────────────────────────────────────────────────
 * subscribeToLounge's INSERT handler AWAITS resolveProfile() — a real query on
 * a cache miss — and then writes the message into currentMessages. A member who
 * changes rooms inside that window had the previous room's dispatch appear in
 * the new room's transcript.
 *
 * It is the only one of the six realtime handlers that INTRODUCES a message.
 * The others map over currentMessages by id, so after a room change nothing
 * matches and they are inert. That is why this one needed the check and they
 * did not.
 */
import { useLoungeStore } from '../lounge';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const U2 = '44444444-4444-4444-8444-444444444444';

type Handler = (payload: Record<string, unknown>) => void | Promise<void>;
const handlers: { event: string; table?: string; fn: Handler }[] = [];

const mockFrom = jest.fn();
let releaseProfile: () => void = () => {};

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: jest.fn(),
    removeChannel: jest.fn(),
    channel: () => {
      const ch: Record<string, unknown> = {};
      ch.on = (kind: string, cfg: Record<string, unknown>, fn: Handler) => {
        handlers.push({ event: String(cfg?.event ?? kind), table: cfg?.table as string, fn });
        return ch;
      };
      ch.subscribe = () => ch;
      ch.track = jest.fn();
      ch.send = jest.fn();
      ch.presenceState = () => ({});
      return ch;
    },
  },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) },
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

/** The profile lookup is held open so the room can change mid-flight. */
const profileChain = () => {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const f of ['select', 'eq'] as const) c[f] = () => self();
  c.single = () => new Promise((resolve) => {
    releaseProfile = () => resolve({ data: { username: 'someone', avatar_url: null }, error: null });
  });
  return c;
};

beforeEach(() => {
  handlers.length = 0;
  mockFrom.mockReset().mockImplementation(() => profileChain());
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: null, sending: false,
    members: {}, loading: false, typingUsers: [], presentCount: 0,
  } as never);
});

const insertHandler = () =>
  handlers.find((h) => h.event === 'INSERT' && h.table === 'lounge_messages')!.fn;

const wireRow = (id: string, lounge: string) => ({
  new: {
    id, lounge_id: lounge, user_id: U2, content: 'Arriving.', type: 'text',
    created_at: '2026-09-11T12:00:00Z', metadata: null,
  },
});

describe('a dispatch arriving over the wire', () => {
  it('is DISCARDED when the member has already moved to another room', async () => {
    useLoungeStore.setState({ currentLoungeId: A } as never);
    useLoungeStore.getState().subscribeToLounge(A);

    // The wire delivers a message for room A; the profile lookup is in flight.
    const landing = insertHandler()(wireRow('a-live', A));

    // The member opens room B before the lookup returns.
    useLoungeStore.setState({ currentLoungeId: B, currentMessages: [] } as never);

    releaseProfile();
    await landing;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(`room=${useLoungeStore.getState().currentLoungeId === B ? 'B' : 'A'} messages=[${ids.join(',')}]`)
      .toBe('room=B messages=[]');
  });

  it('lands when the member is still in that room', async () => {
    useLoungeStore.setState({ currentLoungeId: A } as never);
    useLoungeStore.getState().subscribeToLounge(A);

    const landing = insertHandler()(wireRow('a-live', A));
    releaseProfile();
    await landing;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(['a-live']);
  });

  it('replaces the optimistic copy rather than showing the dispatch twice', async () => {
    useLoungeStore.setState({
      currentLoungeId: A,
      currentMessages: [{
        id: 'a-live', lounge_id: A, user_id: U2, username: 'me',
        content: 'Arriving.', type: 'text', created_at: '2026-09-11T12:00:00Z',
      }],
    } as never);
    useLoungeStore.getState().subscribeToLounge(A);

    const landing = insertHandler()(wireRow('a-live', A));
    releaseProfile();
    await landing;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(['a-live']);
  });
});
