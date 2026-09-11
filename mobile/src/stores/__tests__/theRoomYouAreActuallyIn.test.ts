/**
 * theRoomYouAreActuallyIn.test.ts — two ways a transcript showed the wrong words.
 * ─────────────────────────────────────────────────────────────────────────────
 * Both defects lived in the dark half of lounge.ts, found by reading it rather
 * than by covering it, and neither could be seen from a passing suite.
 *
 *   1. fetchMessages set `currentLoungeId` up front, awaited, then wrote
 *      `currentMessages` with no check the member was still in that room. Tap
 *      room A, tap room B; if A's fetch is slower it lands last and A's
 *      conversation renders under B's name. Anything typed then goes to B.
 *
 *   2. loadMoreMessages read `currentMessages` BEFORE awaiting and then wrote
 *      `[...older, ...thatSnapshot]`. A dispatch arriving over realtime while
 *      the member scrolled up was erased by the write — a message loss nobody
 *      reports, because they never saw it arrive.
 *
 * An essay is shared into a room, so this is on the Dispatch path.
 */
import { useLoungeStore } from '../lounge';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';

const mockFrom = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => mockFrom(...a), channel: jest.fn(), rpc: jest.fn() },
}));
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: U1, username: 'testuser' } }) },
}));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

/** A row as the select returns it, newest-first (the store reverses). */
const row = (id: string, createdAt: string, lounge: string) => ({
  id, lounge_id: lounge, user_id: U1, content: `msg ${id}`, type: 'text',
  created_at: createdAt, deleted_at: null, metadata: null,
  reply_to_id: null, reply_to_username: null, reply_to_content: null,
  film_id: null, film_title: null, film_poster: null,
  profiles: { username: 'testuser', avatar_url: null },
});

/**
 * A chain whose terminal promise resolves only when the test releases it, so
 * two fetches can be held open at once and landed in a chosen order.
 */
const makeChain = (result: unknown, gate?: Promise<void>) => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const f of ['select', 'eq', 'order', 'limit', 'in', 'or', 'not', 'neq'] as const) chain[f] = () => self();
  chain.then = (res: (v: unknown) => unknown) =>
    (gate ? gate.then(() => result) : Promise.resolve(result)).then(res);
  return chain;
};

beforeEach(() => {
  mockFrom.mockReset();
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: null,
    sending: false, members: {}, loading: false, typingUsers: {},
  } as never);
});

describe('a slow fetch must not write into the room you left', () => {
  it('DISCARDS room A’s messages when the member has moved to room B', async () => {
    let releaseA: () => void = () => {};
    const aGate = new Promise<void>((r) => { releaseA = r; });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'lounge_message_reactions') return makeChain({ data: [], error: null });
      // whichever room asks first in this test is A, and it is held open
      return makeChain(
        { data: [row('a1', '2026-09-11T10:00:00Z', A)], error: null },
        aGate,
      );
    });

    const slowA = useLoungeStore.getState().fetchMessages(A);

    // The member moves on. B lands first and owns the screen.
    useLoungeStore.setState({ currentLoungeId: B, currentMessages: [
      { id: 'b1', lounge_id: B, user_id: U1, username: 'testuser', content: 'msg b1', type: 'text', created_at: '2026-09-11T11:00:00Z' },
    ] } as never);

    releaseA();
    await slowA;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(`room=${useLoungeStore.getState().currentLoungeId} messages=${ids.join(',')}`)
      .toBe(`room=${B} messages=b1`);
  });

  it('still writes when the member IS in that room', async () => {
    mockFrom.mockImplementation((table: string) =>
      table === 'lounge_message_reactions'
        ? makeChain({ data: [], error: null })
        : makeChain({ data: [row('a1', '2026-09-11T10:00:00Z', A)], error: null }));

    await useLoungeStore.getState().fetchMessages(A);

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(['a1']);
    expect(useLoungeStore.getState().loading).toBe(false);
  });
});

describe('paging back must not erase what arrived while you were reading', () => {
  it('KEEPS a realtime dispatch that landed during the page load', async () => {
    useLoungeStore.setState({
      currentLoungeId: A,
      currentMessages: [
        { id: 'old', lounge_id: A, user_id: U1, username: 'testuser', content: 'msg old', type: 'text', created_at: '2026-09-11T10:00:00Z' },
      ],
    } as never);

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    mockFrom.mockImplementation(() =>
      makeChain({ data: [row('older', '2026-09-11T09:00:00Z', A)], error: null }, gate));

    const paging = useLoungeStore.getState().loadMoreMessages(A);

    // A new dispatch arrives over realtime while the page is still in flight.
    useLoungeStore.setState(s => ({
      currentMessages: [...(s.currentMessages as never[]), {
        id: 'arrived', lounge_id: A, user_id: U1, username: 'testuser',
        content: 'msg arrived', type: 'text', created_at: '2026-09-11T10:30:00Z',
      }],
    }) as never);

    release();
    await paging;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    // Oldest first, and nothing lost.
    expect(ids).toEqual(['older', 'old', 'arrived']);
  });

  it('does not prepend room A’s history onto room B’s transcript', async () => {
    useLoungeStore.setState({
      currentLoungeId: A,
      currentMessages: [
        { id: 'a-old', lounge_id: A, user_id: U1, username: 'testuser', content: 'msg', type: 'text', created_at: '2026-09-11T10:00:00Z' },
      ],
    } as never);

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    mockFrom.mockImplementation(() =>
      makeChain({ data: [row('a-older', '2026-09-11T09:00:00Z', A)], error: null }, gate));

    const paging = useLoungeStore.getState().loadMoreMessages(A);
    useLoungeStore.setState({ currentLoungeId: B, currentMessages: [
      { id: 'b1', lounge_id: B, user_id: U1, username: 'testuser', content: 'msg b1', type: 'text', created_at: '2026-09-11T11:00:00Z' },
    ] } as never);
    release();
    await paging;

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(['b1']);
  });

  it('never shows the same dispatch twice', async () => {
    // The page and the live list can legitimately overlap at the boundary.
    useLoungeStore.setState({
      currentLoungeId: A,
      currentMessages: [
        { id: 'dup', lounge_id: A, user_id: U1, username: 'testuser', content: 'msg', type: 'text', created_at: '2026-09-11T09:00:00Z' },
      ],
    } as never);
    mockFrom.mockImplementation(() =>
      makeChain({ data: [row('dup', '2026-09-11T09:00:00Z', A)], error: null }));

    await useLoungeStore.getState().loadMoreMessages(A);

    const ids = (useLoungeStore.getState().currentMessages as unknown as { id: string }[]).map((m) => m.id);
    expect(ids).toEqual(['dup']);
  });
});
