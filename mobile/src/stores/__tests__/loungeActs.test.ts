/**
 * loungeActs.test.ts — the room's own acts, driven.
 * ─────────────────────────────────────────────────────────────────────────────
 * `lounge.ts` is 515 lines at 12.9%. It is the page an essay is SHARED INTO, so
 * it sits on the Dispatch's path, and it is where a real bug was found today:
 * the unread count included your own messages, so sharing an essay into a room
 * you were not looking at raised your own badge over your own share.
 *
 * `lounge.test.ts` covers withdrawal and the message window. This covers the
 * acts it does not: sending, the send throttle, marking read, joining, leaving,
 * and the guard that decides whether a member may speak at all.
 *
 * ── WRITTEN AGAINST THE REAL API, THE SECOND TIME ───────────────────────────
 * The first draft of this file asserted a store that does not exist — a
 * per-room `messages` map, a `clearMessages(loungeId)`, a `canSendMessage` that
 * checks auth. Six tests failed and every one of them was the test being wrong.
 * The store keeps ONE open room: `currentLoungeId` and `currentMessages`.
 * That is worth stating, because a test written against an imagined API passes
 * the day somebody changes the real one.
 */
import { useLoungeStore } from '../lounge';

/**
 * ── THE IDS ARE REAL UUIDS ON PURPOSE ───────────────────────────────────────
 * `sendMessage` validates its payload against `LoungeMessagePayloadSchema`,
 * where `lounge_id` and `user_id` are `z.string().uuid()`. With ids like 'l1'
 * every send died at that schema and returned false — so a test asserting
 * "false" passed no matter what the store did. Two guards in this file were
 * proved worthless that way. Short ids are not a shortcut here; they are a
 * different code path.
 */
const L1 = '11111111-1111-4111-8111-111111111111';
const L2 = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const U2 = '44444444-4444-4444-8444-444444444444';

const mockFrom = jest.fn();
const mockChannel = jest.fn();
const mockRpc = jest.fn();
let mockUser: Record<string, unknown> | null = { id: U1, username: 'testuser', role: 'cinephile' };

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => mockFrom(...a),
    channel: (...a: unknown[]) => mockChannel(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));

const mockEnqueue = jest.fn();
jest.mock('../../utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(),
  getOfflineQueue: jest.fn().mockReturnValue([]),
}));
jest.mock('../../utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('../../utils/mappers', () => ({
  mapMessageRow: (row: Record<string, unknown>) => ({
    id: row.id, lounge_id: row.lounge_id, user_id: row.user_id,
    username: row.username ?? 'unknown', content: row.content ?? '',
    type: row.type ?? 'text', created_at: row.created_at ?? '2026-09-11T00:00:00Z',
  }),
  LoungeMessageRow: {},
}));

interface Recorded { table: string; op?: string; payload?: unknown; filters: Record<string, unknown>; }
let recorded: Recorded[] = [];
let nextResult: { data: unknown; error: unknown } = { data: null, error: null };

const chainFor = (table: string) => {
  const rec: Recorded = { table, filters: {} };
  recorded.push(rec);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const op of ['insert', 'update', 'upsert', 'delete'] as const) {
    chain[op] = (payload?: unknown) => { rec.op = op; rec.payload = payload; return self(); };
  }
  for (const f of ['select', 'order', 'limit', 'range', 'in', 'neq', 'gte', 'lte', 'not', 'or'] as const) {
    chain[f] = () => self();
  }
  chain.eq = (col: string, val: unknown) => { rec.filters[col] = val; return self(); };
  chain.single = async () => nextResult;
  chain.maybeSingle = async () => nextResult;
  chain.then = (res: (v: unknown) => unknown) => Promise.resolve(nextResult).then(res);
  return chain;
};

const reset = () => {
  recorded = [];
  nextResult = { data: null, error: null };
  mockUser = { id: U1, username: 'testuser', role: 'cinephile' };
  mockFrom.mockReset().mockImplementation((t: string) => chainFor(t));
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockChannel.mockReset().mockReturnValue({
    on: jest.fn().mockReturnThis(), subscribe: jest.fn().mockReturnThis(),
    send: jest.fn(), unsubscribe: jest.fn(), track: jest.fn(),
  });
  mockEnqueue.mockReset();
  useLoungeStore.setState({
    lounges: [], currentMessages: [], currentLoungeId: null, sending: false,
    members: {}, loading: false, typingUsers: {},
  } as never);
};
const on = (table: string) => recorded.filter((r) => r.table === table);

beforeEach(reset);

// ════════════════════════════════════════════════════════════════════════════
describe('may this member speak in this room', () => {
  it('refuses a room that is not the one open', () => {
    // The store holds ONE open room. Sending into another is a bug in the
    // caller, and the guard is what stops it reaching the database.
    useLoungeStore.setState({ currentLoungeId: L1, sending: false } as never);
    expect(useLoungeStore.getState().canSendMessage(L2)).toBe(false);
  });

  it('allows the room that is open', () => {
    useLoungeStore.setState({ currentLoungeId: L1, sending: false } as never);
    expect(useLoungeStore.getState().canSendMessage(L1)).toBe(true);
  });

  it('refuses while a send is already in flight', () => {
    // Two sends racing is how the same message lands twice.
    useLoungeStore.setState({ currentLoungeId: L1, sending: true } as never);
    expect(useLoungeStore.getState().canSendMessage(L1)).toBe(false);
  });
});

describe('sending — where a member’s words can go missing', () => {
  it('refuses an empty message rather than writing a blank row', async () => {
    const ok = await useLoungeStore.getState().sendMessage(L1, '   ');
    expect(ok).toBe(false);
    expect(on('lounge_messages').some((r) => r.op === 'insert')).toBe(false);
  });

  it('refuses when nobody is signed in', async () => {
    mockUser = null;
    expect(await useLoungeStore.getState().sendMessage(L1, 'Hello.')).toBe(false);
  });

  it('THROTTLES a second send inside 800ms, so one tap is one message', async () => {
    // Not a nicety: without it a double-tap files the same sentence twice and
    // both land, because each is a legitimate insert.
    //
    // ── THE ASSERTION THAT MAKES THIS REAL ────────────────────────────────
    // The first version checked only that the SECOND send returned false. That
    // passes whether the throttle works or not — if both sends fail for some
    // unrelated reason, it is still "false". Mutation-checked and caught:
    // deleting the throttle left this green. Asserting the FIRST succeeded is
    // what turns it into a test of the throttle rather than of nothing.
    nextResult = { data: { id: 'm1', lounge_id: L1, user_id: U1, content: 'One.' }, error: null };
    const first = await useLoungeStore.getState().sendMessage(L1, 'One.');
    const second = await useLoungeStore.getState().sendMessage(L1, 'Two.');
    expect(`first=${first} second=${second}`).toBe('first=true second=false');
  });

  it('REPORTS FAILURE when the house refuses — it must not claim success', async () => {
    // The quiet loss: a send returning true having written nothing leaves the
    // member believing they spoke.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
    nextResult = { data: null, error: { message: 'permission denied' } };
    const ok = await useLoungeStore.getState().sendMessage(L1, 'Hello.');
    expect(ok).toBe(false);
    (Date.now as jest.Mock).mockRestore?.();
  });
});

describe('marking a room read', () => {
  it('stamps last_read_at for THIS room and this member only', async () => {
    await useLoungeStore.getState().markRead(L1);
    const write = on('lounge_members').find((r) => r.op === 'update');
    expect(write).toBeTruthy();
    // Scoped to both, or a read-mark moves in somebody else's room.
    expect(write!.filters).toMatchObject({ lounge_id: L1, user_id: U1 });
    expect(Object.keys(write!.payload as object)).toContain('last_read_at');
  });

  it('clears the badge on that room and leaves the others alone', async () => {
    useLoungeStore.setState({
      lounges: [
        { id: L1, name: 'A', unread_count: 4 },
        { id: L2, name: 'B', unread_count: 2 },
      ],
    } as never);
    await useLoungeStore.getState().markRead(L1);
    const rooms = useLoungeStore.getState().lounges as unknown as { id: string; unread_count: number }[];
    expect(rooms.find((l) => l.id === L1)!.unread_count).toBe(0);
    expect(rooms.find((l) => l.id === L2)!.unread_count).toBe(2);
  });

  it('does nothing at all with no member', async () => {
    mockUser = null;
    await useLoungeStore.getState().markRead(L1);
    expect(on('lounge_members').length).toBe(0);
  });
});

describe('joining, asking and leaving', () => {
  it('joining a public room goes through the RPC, not a raw insert', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });
    await useLoungeStore.getState().joinPublicLounge(L1);
    expect(mockRpc.mock.calls[0][0]).toBe('join_public_lounge');
    // A client-side insert would let a member add themselves to a private room.
    expect(on('lounge_members').some((r) => r.op === 'insert')).toBe(false);
  });

  it('asking at the door returns one of the three answers, never a silent null', async () => {
    mockRpc.mockResolvedValue({ data: 'requested', error: null });
    const r = await useLoungeStore.getState().requestMembership(L1);
    expect(['requested', 'joined', 'error']).toContain(r);
  });

  it('leaving removes only this member’s own row', async () => {
    await useLoungeStore.getState().leaveLounge(L1);
    const del = on('lounge_members').find((r) => r.op === 'delete');
    expect(del).toBeTruthy();
    expect(del!.filters).toMatchObject({ lounge_id: L1, user_id: U1 });
  });
});

describe('the open room’s messages', () => {
  it('clearMessages empties the room that is open', () => {
    useLoungeStore.setState({ currentMessages: [{ id: 'm1' }, { id: 'm2' }] } as never);
    useLoungeStore.getState().clearMessages();
    expect(useLoungeStore.getState().currentMessages).toHaveLength(0);
  });

  it('syncGlobalAvatar updates only that member’s messages', () => {
    useLoungeStore.setState({
      currentMessages: [
        { id: 'm1', user_id: U1, avatar_url: undefined },
        { id: 'm2', user_id: U2, avatar_url: undefined },
      ],
    } as never);
    useLoungeStore.getState().syncGlobalAvatar(U1, '/new.jpg');
    const msgs = useLoungeStore.getState().currentMessages as unknown as
      { id: string; avatar_url?: string }[];
    expect(msgs.find((m) => m.id === 'm1')!.avatar_url).toBe('/new.jpg');
    expect(msgs.find((m) => m.id === 'm2')!.avatar_url).toBeUndefined();
  });
});
