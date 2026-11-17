/**
 * aSalonJoinedAgainHearsTheRoom.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * A salon's channel is left and joined again in the same moment when the member takes a seat (the
 * reader's channel goes, the seated one comes), is muted, or loses a seat. realtime-js hands back
 * the channel already holding the topic, and one being left keeps the topic until the house
 * answers the leave; subscribe() joins only a closed channel. So the seat taken was handed the
 * channel on its way out: nothing joined, no status came, no presence was shared, and nothing
 * said in the room reached the member while it said it was live.
 *
 * Here the realtime client is as realtime-js is in that: a topic's channel is handed back while it
 * is still held, joins only when closed, and is let go when its leave is answered.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const ANA = '66666666-6666-4666-8666-666666666666';

type Handler = (payload: Record<string, unknown>) => unknown;
/** One channel on the socket, as realtime-js keeps it. */
interface Wire {
  topic: string;
  state: 'closed' | 'joined' | 'leaving';
  handlers: { table?: string; event: string; fn: Handler }[];
  status: ((s: string) => void) | null;
  track: jest.Mock;
  api: Record<string, unknown>;
}
/** The socket's channels: a topic's channel stays here until its leave is answered. */
const mockWires: Wire[] = [];
/** Every channel ever made, in order. */
const mockMade: Wire[] = [];
/** Each leave asked, answered when the test says. */
const mockLeaves: (() => void)[] = [];

const mockHouse = supabaseFake({ rows: { profiles: [{ id: ANA, username: 'ana' }, { id: ME, username: 'me' }] } });
function mockRealtime(client: typeof mockHouse.client) {
  const make = (topic: string): Wire => {
    const wire: Wire = { topic, state: 'closed', handlers: [], status: null, track: jest.fn(), api: {} };
    Object.assign(wire.api, {
      on: (kind: string, cfg: Record<string, unknown>, fn: Handler) => {
        wire.handlers.push({ event: String(cfg?.event ?? kind), table: cfg?.table as string | undefined, fn });
        return wire.api;
      },
      // Joins only a closed channel, as RealtimeChannel.subscribe does; the house answers a beat later.
      subscribe: (cb?: (s: string) => void) => {
        if (wire.state !== 'closed') return wire.api;
        wire.state = 'joined';
        wire.status = cb ?? null;
        void Promise.resolve().then(() => { if (wire.state === 'joined') wire.status?.('SUBSCRIBED'); });
        return wire.api;
      },
      track: wire.track,
      send: jest.fn(),
      presenceState: () => ({}),
    });
    mockMade.push(wire);
    mockWires.push(wire);
    return wire;
  };
  return {
    ...client,
    // RealtimeClient.channel: the channel already holding the topic, while it is held.
    channel: (name: string) => {
      const topic = `realtime:${name}`;
      return (mockWires.find((w) => w.topic === topic) ?? make(topic)).api;
    },
    removeChannel: (api: unknown) => {
      const wire = mockWires.find((w) => w.api === api);
      if (!wire) return Promise.resolve('ok');
      wire.state = 'leaving';
      return new Promise<'ok'>((resolve) => {
        mockLeaves.push(() => {
          const at = mockWires.indexOf(wire);
          if (at >= 0) mockWires.splice(at, 1);
          wire.state = 'closed';
          wire.status?.('CLOSED');
          resolve('ok');
        });
      });
    },
  };
}
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockRealtime(mockHouse.client); } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: '33333333-3333-4333-8333-333333333333', username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

const RESETS = (jest.requireMock('../resetAllStores') as { registerStoreReset: jest.Mock }).registerStoreReset.mock.calls
  .map(([handler]) => handler as (previous: string | null) => void);
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const answerLeaves = async () => { for (const leave of mockLeaves.splice(0)) leave(); await settle(); };

/** Something said in the room by another member, over every channel joined to it. */
async function said(id: string, words: string) {
  const row = { id, lounge_id: SALON, user_id: ANA, content: words, type: 'text', created_at: '2026-11-17T10:00:00.000Z' };
  for (const wire of mockWires.filter((w) => w.topic === `realtime:lounge-${SALON}` && w.state === 'joined')) {
    for (const h of wire.handlers.filter((x) => x.event === 'INSERT' && x.table === 'lounge_messages')) await h.fn({ new: row });
  }
  await settle();
}
const heard = () => useLoungeStore.getState().currentMessages.map((m) => m.content);
const joinedNow = () => mockWires.filter((w) => w.topic === `realtime:lounge-${SALON}` && w.state === 'joined');

beforeEach(async () => {
  await answerLeaves();
  for (const forget of RESETS) forget(null);
  await answerLeaves();
  mockWires.length = 0;
  mockMade.length = 0;
  useLoungeStore.setState({ currentLoungeId: SALON, currentMessages: [], typingUsers: [], presentCount: 0, roomLive: true } as never);
});

it('a reader who takes a seat hears the room on a new channel, and shares their presence', async () => {
  const leaveReading = useLoungeStore.getState().subscribeToLounge(SALON, { seated: false });
  await settle();
  expect(joinedNow()).toHaveLength(1);

  // The seat taken: the reader's channel is left and the seated one joined in the same moment.
  leaveReading();
  const leaveSeated = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await answerLeaves();

  // A channel of its own, joined, its status heard: presence is shared once it is live.
  expect(mockMade).toHaveLength(2);
  const seated = mockMade[1];
  expect(seated).toBeDefined();
  expect(seated!.state).toBe('joined');
  expect(seated!.track).toHaveBeenCalledWith({ username: 'me' });
  // And what is said in the room reaches the member.
  await said('a0000000-0000-4000-8000-000000000001', 'Welcome to the back row.');
  expect(heard()).toEqual(['Welcome to the back row.']);
  leaveSeated();
});

it('a seat lost and taken again in a row ends on one channel, joined and heard', async () => {
  const first = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await settle();
  first();
  const second = useLoungeStore.getState().subscribeToLounge(SALON, { seated: false });
  second();
  const third = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await answerLeaves();
  await answerLeaves();

  // The one closed before it opened never opened: the first channel and the last one alone.
  expect(mockMade).toHaveLength(2);
  expect(joinedNow()).toHaveLength(1);
  await said('a0000000-0000-4000-8000-000000000002', 'Still here.');
  expect(heard()).toEqual(['Still here.']);
  third();
});

it('a salon joined again opens once its leave is answered, and never for the next member once this one signs out', async () => {
  // Joined again in the same moment: it opens on the leave's answer.
  const reading = useLoungeStore.getState().subscribeToLounge(SALON, { seated: false });
  await settle();
  reading();
  const seated = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await answerLeaves();
  expect(joinedNow()).toHaveLength(1);

  // Left and joined again, and the member signs out while the new one waits on the leave.
  seated();
  useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  for (const forget of RESETS) forget(ME);
  await answerLeaves();
  expect(mockMade).toHaveLength(2);
  expect(joinedNow()).toHaveLength(0);
  useLoungeStore.setState({ currentLoungeId: SALON } as never);
  await said('a0000000-0000-4000-8000-000000000003', 'For the next member?');
  expect(heard()).toEqual([]);
});

it('a salon live at sign-out is left whole: its closing is no drop, the next member is never told the room is not live, and nothing is read again', async () => {
  jest.useFakeTimers();
  try {
    useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
    await settle();
    expect(joinedNow()).toHaveLength(1);
    expect(useLoungeStore.getState().roomLive).toBe(true);

    // Signed out with the salon open: its leave asked, and answered with the channel's CLOSED.
    for (const forget of RESETS) forget(ME);
    expect(mockLeaves).toHaveLength(1);
    await answerLeaves();
    expect(joinedNow()).toHaveLength(0);

    // Past the not-live grace (5 s) and a re-read interval (15 s): still live, and no timer left.
    jest.advanceTimersByTime(20_001);
    expect(useLoungeStore.getState().roomLive).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});
