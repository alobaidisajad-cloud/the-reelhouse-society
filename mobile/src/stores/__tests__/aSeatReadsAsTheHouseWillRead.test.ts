/**
 * aSeatReadsAsTheHouseWillRead.test.ts — a salon joined, founded or left is
 * drawn at once as the corridor's next read will give it.
 *
 * The seat a member takes or gives up is drawn before the house is read again
 * (seatedIn, leftBehind). If those two disagree with the read, the corridor
 * shows one thing and then jumps to another: leaving once set a field the
 * corridor never read, so a salon left stayed among "your salons" until the
 * next read. Here a small house answers fetchLounges's own queries — the
 * rooms, the seats, member_count as its trigger counts it (approved members
 * only) — and each drawn room is held against what the next read gives.
 *
 * Its create_lounge founds the room the form named once (p_id), as the house's
 * does, and can lose an answer on the way back after founding.
 */
import { isMine, leftBehind, seatedIn, useLoungeStore, type LoungeRoom } from '../lounge';

const mockMe = '33333333-3333-4333-8333-333333333333';
const HOST = '44444444-4444-4444-8444-444444444444';
const ADA = '55555555-5555-4555-8555-555555555555';

type Seat = { lounge_id: string; user_id: string; status: 'approved' | 'pending' | 'muted' | 'banned' };
type Room = { id: string; name: string; description: string; is_private: boolean; creator_id: string; created_at: string; cover_image: string | null; lastMessageAt: string | null };
const mockHouse = { rooms: [] as Room[], seats: [] as Seat[], loseAnswer: false };

const counted = (id: string) => mockHouse.seats.filter((s) => s.lounge_id === id && s.status === 'approved').length;
const asRow = ({ lastMessageAt: _unread, ...room }: Room) => ({ ...room, member_count: counted(room.id) });

type Op = [string, ...unknown[]];
/** What the house answers a query, read from what was asked of it. */
function mockAnswer(table: string, ops: Op[]): unknown[] {
  const eq = (col: string) => ops.find((o) => o[0] === 'eq' && o[1] === col)?.[2];
  const within = ops.find((o) => o[0] === 'in')?.[2] as string[] | undefined;
  if (table === 'lounge_members') {
    if (ops.some((o) => o[0] === 'delete')) {
      const gone = mockHouse.seats.filter((s) => s.lounge_id === eq('lounge_id') && s.user_id === eq('user_id'));
      mockHouse.seats = mockHouse.seats.filter((s) => !gone.includes(s));
      return gone.map(() => ({ id: 'seat' }));
    }
    if (eq('user_id')) {
      return mockHouse.seats.filter((s) => s.user_id === eq('user_id')).map((s) => ({ lounge_id: s.lounge_id, last_read_at: null, status: s.status }));
    }
    return mockHouse.seats.filter((s) => within?.includes(s.lounge_id) && s.status === eq('status')).map((s) => ({ lounge_id: s.lounge_id }));
  }
  if (table === 'lounges') {
    if (within) return mockHouse.rooms.filter((r) => within.includes(r.id)).map(asRow);
    if (eq('creator_id')) return mockHouse.rooms.filter((r) => r.creator_id === eq('creator_id')).map(asRow);
    return mockHouse.rooms.map(asRow);
  }
  throw new Error(`the house has no ${table}`);
}

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const ops: Op[] = [];
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'in', 'order', 'limit', 'delete']) {
        chain[k] = (...args: unknown[]) => { ops.push([k, ...args]); return chain; };
      }
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve().then(() => ({ data: mockAnswer(table, ops), error: null })).then(res, rej);
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const mine = mockHouse.seats.filter((s) => s.user_id === mockMe).map((s) => s.lounge_id);
      if (fn === 'get_lounge_unread_counts') {
        return { data: mockHouse.rooms.filter((r) => mine.includes(r.id)).map((r) => ({ lounge_id: r.id, unread_count: 0, last_message_at: r.lastMessageAt })), error: null };
      }
      if (fn === 'get_salon_member_faces') {
        const ids = args.p_lounge_ids as string[];
        return { data: mockHouse.seats.filter((s) => ids.includes(s.lounge_id) && s.status === 'approved').map((s) => ({ lounge_id: s.lounge_id, username: s.user_id === mockMe ? 'kane' : 'ada', avatar_url: null })), error: null };
      }
      if (fn === 'join_public_lounge') {
        mockHouse.seats.push({ lounge_id: args.p_lounge_id as string, user_id: mockMe, status: 'approved' });
        return { data: null, error: null };
      }
      if (fn === 'create_lounge') {
        const id = args.p_id as string;
        if (!mockHouse.rooms.some((r) => r.id === id)) {
          mockHouse.rooms.push({ id, name: args.p_name as string, description: args.p_description as string, is_private: args.p_is_private as boolean, creator_id: mockMe, created_at: new Date().toISOString(), cover_image: null, lastMessageAt: null });
          mockHouse.seats.push({ lounge_id: id, user_id: mockMe, status: 'approved' });
        }
        if (mockHouse.loseAnswer) {
          mockHouse.loseAnswer = false;
          return { data: null, error: { message: 'TypeError: Network request failed', code: '', details: '', hint: '' } };
        }
        return { data: id, error: null };
      }
      throw new Error(`the house has no function ${fn}`);
    },
    channel: jest.fn(),
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: mockMe, username: 'kane' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
/** The Lounge store's own reset (as a sign-out runs it), taken as the store registered it at load. */
const loungeResets = (): (() => void)[] =>
  (jest.requireMock('../resetAllStores') as { registerStoreReset: jest.Mock }).registerStoreReset.mock.calls.map(([fn]) => fn as () => void);
let resets: (() => void)[] = [];
beforeAll(() => { resets = loungeResets(); });
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

const SALON = 'room-salon';
const room = (id: string) => useLoungeStore.getState().lounges.find((l) => l.id === id) as LoungeRoom;
const readAgain = async (id: string) => { await useLoungeStore.getState().fetchLounges(); return room(id); };
/** What decides where a room is drawn and what may be done in it. */
const standing = (r: LoungeRoom) => ({
  mine: r.mine, membership_status: r.membership_status, unread_count: r.unread_count,
  member_count: r.member_count, pending_count: r.pending_count,
});

beforeEach(() => {
  // A phone that has founded nothing yet: the half-minute between foundings is the store's own, and
  // a founding in one test held the next test's back in whatever order they ran (nightly 42468307829).
  expect(resets.length).toBeGreaterThan(0);
  for (const reset of resets) reset();
  mockHouse.rooms = [{ id: SALON, name: 'The Nitrate Circle', description: 'Silent era.', is_private: false, creator_id: HOST, created_at: '2026-06-01T00:00:00Z', cover_image: null, lastMessageAt: '2026-10-01T20:00:00Z' }];
  mockHouse.seats = [{ lounge_id: SALON, user_id: HOST, status: 'approved' }, { lounge_id: SALON, user_id: ADA, status: 'approved' }];
  mockHouse.loseAnswer = false;
  useLoungeStore.setState({ lounges: [], loungesFailed: false, loungesLoading: false });
});

describe('a salon left', () => {
  it.each([false, true])('is drawn at once as the next read gives it (private: %s)', async (isPrivate) => {
    mockHouse.rooms[0].is_private = isPrivate;
    mockHouse.seats.push({ lounge_id: SALON, user_id: mockMe, status: 'approved' });
    const before = await readAgain(SALON);
    expect(isMine(before)).toBe(true);
    expect(before.memberFaces?.length).toBeGreaterThan(0);

    expect(await useLoungeStore.getState().leaveLounge(SALON)).toBe(true);
    const drawn = room(SALON);
    expect(isMine(drawn)).toBe(false);
    expect(drawn).toEqual(await readAgain(SALON));
  });

  it('a request still at the door, withdrawn, takes no one off the count', async () => {
    mockHouse.rooms[0].is_private = true;
    mockHouse.seats.push({ lounge_id: SALON, user_id: mockMe, status: 'pending' });
    const before = await readAgain(SALON);
    expect(before.membership_status).toBe('pending');
    expect(isMine(before)).toBe(true);

    expect(leftBehind(before)).toEqual(await (async () => {
      mockHouse.seats = mockHouse.seats.filter((s) => s.user_id !== mockMe);
      return readAgain(SALON);
    })());
  });
});

describe('a salon joined', () => {
  it('is drawn at once as the next read gives it (its faces come with that read)', async () => {
    const before = await readAgain(SALON);
    expect(isMine(before)).toBe(false);
    mockHouse.seats.push({ lounge_id: SALON, user_id: mockMe, status: 'approved' });
    expect(standing(seatedIn(before))).toEqual(standing(await readAgain(SALON)));
  });

  it('through the store, ends as the house has it', async () => {
    await readAgain(SALON);
    expect(await useLoungeStore.getState().joinPublicLounge(SALON)).toBe(true);
    expect(isMine(room(SALON))).toBe(true);
    expect(room(SALON).member_count).toBe(3);
  });
});

describe('a salon founded', () => {
  it('is drawn at once as the next read gives it', async () => {
    const id = await useLoungeStore.getState().createLounge('The Late Show', 'Midnight only.', false, 'room-late-show');
    expect(id).not.toBeNull();
    const drawn = standing(room(id as string));
    expect(drawn).toEqual(standing(await readAgain(id as string)));
  });

  it('is founded on a phone whose clock was set back since the last founding', async () => {
    // The last founding stamped a minute ahead (a clock run ahead, then put right): the half-minute
    // is counted forward only, so the clock put back holds nothing back.
    const ahead = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    try {
      expect(await useLoungeStore.getState().createLounge('The Early Show', 'Dawn only.', false, 'room-early-show')).not.toBeNull();
    } finally {
      ahead.mockRestore();
    }
    expect(await useLoungeStore.getState().createLounge('The Matinee', 'Afternoons.', false, 'room-matinee')).toBe('room-matinee');
  });

  it('asked for again after its answer was lost, is the one room, drawn once', async () => {
    // Past the half-minute a founding holds the next back, whichever founded before it.
    const later = Date.now() + 60_000;
    const clock = jest.spyOn(Date, 'now').mockReturnValue(later);
    try {
      mockHouse.loseAnswer = true;
      const ask = () => useLoungeStore.getState().createLounge('The Noir Corner', 'Wet streets.', false, 'room-noir');
      expect(await ask()).toBeNull();
      // The corridor's own read, between the two taps, already draws the room the house founded.
      await readAgain('room-noir');
      expect(await ask()).toBe('room-noir');
      expect(mockHouse.rooms.filter((r) => r.name === 'The Noir Corner')).toHaveLength(1);
      expect(mockHouse.seats.filter((s) => s.lounge_id === 'room-noir')).toHaveLength(1);
      expect(useLoungeStore.getState().lounges.filter((l) => l.id === 'room-noir')).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });
});
