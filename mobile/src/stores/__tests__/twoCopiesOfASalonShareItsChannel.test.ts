/**
 * twoCopiesOfASalonShareItsChannel.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * A second copy of a salon's room over the first (a salon opened again from inside it) asked for
 * the salon's channel while the first held it. realtime-js hands back the channel already holding
 * the topic, and refuses (throws) a listener added to a channel already joined; and the copy,
 * leaving, removed the one channel both listened on: the room beneath heard nothing more, and five
 * seconds on said it was not live, read again every fifteen seconds for as long as it stood.
 *
 * Now the two rooms hold one channel: the second is told where it stands at once, the channel's
 * word reaches both, and it is left only with the last room. The realtime client here is as
 * realtime-js is: a topic's channel is handed back while held, a listener added after subscribe()
 * throws, and a channel is let go when its leave is answered.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useLoungeStore } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const ANA = '66666666-6666-4666-8666-666666666666';

type Handler = (payload: Record<string, unknown>) => unknown;
interface Wire {
  topic: string;
  state: 'closed' | 'joined' | 'leaving';
  handlers: { table?: string; event: string; fn: Handler }[];
  status: ((s: string) => void) | null;
  api: Record<string, unknown>;
}
const mockWires: Wire[] = [];
const mockMade: Wire[] = [];
const mockLeaves: (() => void)[] = [];

const mockHouse = supabaseFake({ rows: { profiles: [{ id: ANA, username: 'ana' }] } });
function mockRealtime(client: typeof mockHouse.client) {
  const make = (topic: string): Wire => {
    const wire: Wire = { topic, state: 'closed', handlers: [], status: null, api: {} };
    Object.assign(wire.api, {
      on: (kind: string, cfg: Record<string, unknown>, fn: Handler) => {
        // As RealtimeChannel.on: a changes or presence listener on a joined channel is refused.
        if (wire.state === 'joined' && (kind === 'postgres_changes' || kind === 'presence')) {
          throw new Error(`cannot add \`${kind}\` callbacks for ${topic} after \`subscribe()\`.`);
        }
        wire.handlers.push({ event: String(cfg?.event ?? kind), table: cfg?.table as string | undefined, fn });
        return wire.api;
      },
      subscribe: (cb?: (s: string) => void) => {
        if (wire.state !== 'closed') return wire.api;
        wire.state = 'joined';
        wire.status = cb ?? null;
        void Promise.resolve().then(() => { if (wire.state === 'joined') wire.status?.('SUBSCRIBED'); });
        return wire.api;
      },
      track: jest.fn(),
      send: jest.fn(),
      presenceState: () => ({}),
    });
    mockMade.push(wire);
    mockWires.push(wire);
    return wire;
  };
  return {
    ...client,
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
const joinedNow = () => mockWires.filter((w) => w.topic === `realtime:lounge-${SALON}` && w.state === 'joined');

async function said(id: string, words: string) {
  const row = { id, lounge_id: SALON, user_id: ANA, content: words, type: 'text', created_at: '2026-11-17T10:00:00.000Z' };
  for (const wire of joinedNow()) {
    for (const h of wire.handlers.filter((x) => x.event === 'INSERT' && x.table === 'lounge_messages')) await h.fn({ new: row });
  }
  await settle();
}
const heard = () => useLoungeStore.getState().currentMessages.map((m) => m.content);

beforeEach(async () => {
  for (const forget of RESETS) forget(null);
  await answerLeaves();
  mockWires.length = 0;
  mockMade.length = 0;
  useLoungeStore.setState({ currentLoungeId: SALON, currentMessages: [], typingUsers: [], presentCount: 0, roomLive: true } as never);
});

it('a second copy of the room opens on the first one’s channel, never asks for another, and is never refused', async () => {
  const beneath = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await settle();
  let copy: (() => void) | undefined;
  expect(() => { copy = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true }); }).not.toThrow();
  expect(mockMade).toHaveLength(1);
  copy?.();
  beneath();
});

it('the copy leaving leaves the room beneath its channel: still joined, still heard, and never said to be not live', async () => {
  jest.useFakeTimers();
  try {
    const beneath = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
    await settle();
    const copy = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
    await settle();
    copy();
    await answerLeaves();
    expect(joinedNow()).toHaveLength(1);
    await said('a0000000-0000-4000-8000-000000000011', 'The reel is changing.');
    expect(heard()).toEqual(['The reel is changing.']);
    // Past the not-live grace and a re-read interval: the room beneath is still live.
    jest.advanceTimersByTime(20_001);
    expect(useLoungeStore.getState().roomLive).toBe(true);
    beneath();
    await answerLeaves();
    expect(joinedNow()).toHaveLength(0);
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('the room beneath leaving first leaves the channel to the copy, which hears its seats change and its drop', async () => {
  jest.useFakeTimers();
  try {
    const beneathHeard = jest.fn();
    const copyHeard = jest.fn();
    const beneath = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true, onMembership: beneathHeard });
    await settle();
    const copy = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true, onMembership: copyHeard });
    beneath();
    await answerLeaves();
    const wire = joinedNow()[0];
    expect(wire).toBeDefined();
    // A seat changed: the room still holding the channel is told, the one gone is not.
    for (const h of wire!.handlers.filter((x) => x.table === 'lounge_members')) await h.fn({});
    expect([beneathHeard.mock.calls.length, copyHeard.mock.calls.length]).toEqual([0, 1]);
    // The channel drops: the copy, which never heard its join itself, is told it is not live.
    wire!.status?.('CHANNEL_ERROR');
    jest.advanceTimersByTime(5_001);
    expect(useLoungeStore.getState().roomLive).toBe(false);
    copy();
  } finally {
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('signed out with two copies open, the channel is left whole, and nothing is read again', async () => {
  useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  await settle();
  useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  for (const forget of RESETS) forget('33333333-3333-4333-8333-333333333333');
  expect(mockLeaves).toHaveLength(1);
  await answerLeaves();
  expect(joinedNow()).toHaveLength(0);
});
