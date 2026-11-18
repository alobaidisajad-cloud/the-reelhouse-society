/**
 * theNoticesChannelOpensForTheNextMember.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * The notices' channel has one name for every member ('global_notifications'). At a switch of
 * member it is closed for the one leaving and opened for the next in the same moment, and
 * realtime-js hands back the channel already holding a name until the house answers its leave;
 * subscribe() joins only a closed one. The next member was handed the last one's channel on its
 * way out: nothing joined, and no notice of theirs arrived live. Now the next member's channel
 * opens once the leave is answered, a channel of its own, and their notices arrive.
 *
 * Here the realtime client is as realtime-js is in that: a name's channel is handed back while it
 * is still held, joins only when closed, and is let go when its leave is answered.
 */
import { supabaseFake } from '@/test-utils/supabaseFake';
import { useNotificationStore } from '../notificationStore';

const FIRST = '77777777-7777-4777-8777-777777777777';
const NEXT = '88888888-8888-4888-8888-888888888888';

type Handler = (payload: Record<string, unknown>) => unknown;
interface Wire {
  topic: string;
  state: 'closed' | 'joined' | 'leaving';
  handlers: { filter?: string; fn: Handler }[];
  api: Record<string, unknown>;
}
const mockWires: Wire[] = [];
const mockMade: Wire[] = [];
const mockLeaves: (() => void)[] = [];

const mockHouse = supabaseFake({ rows: {} });
function mockRealtime(client: typeof mockHouse.client) {
  const make = (topic: string): Wire => {
    const wire: Wire = { topic, state: 'closed', handlers: [], api: {} };
    Object.assign(wire.api, {
      on: (_kind: string, cfg: Record<string, unknown>, fn: Handler) => {
        wire.handlers.push({ filter: cfg?.filter as string | undefined, fn });
        return wire.api;
      },
      subscribe: (cb?: (s: string) => void) => {
        if (wire.state !== 'closed') return wire.api;
        wire.state = 'joined';
        void Promise.resolve().then(() => { if (wire.state === 'joined') cb?.('SUBSCRIBED'); });
        return wire.api;
      },
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
          resolve('ok');
        });
      });
    },
  };
}
let mockUser: { id: string; username: string } | null = null;
jest.mock('../../lib/supabase', () => ({ get supabase() { return mockRealtime(mockHouse.client); } }));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: mockUser }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }), subscribe: () => () => {} } }));

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const answerLeaves = async () => { for (const leave of mockLeaves.splice(0)) leave(); await settle(); };
/** A notice for `to`, as the house sends it over the channels joined to that member's rows. */
function arrives(to: string, id: string, message: string) {
  const row = { id, user_id: to, type: 'system', message, is_read: false, created_at: '2026-11-17T10:00:00.000Z' };
  for (const wire of mockWires.filter((w) => w.topic === 'realtime:global_notifications' && w.state === 'joined')) {
    for (const h of wire.handlers.filter((x) => x.filter === `user_id=eq.${to}`)) h.fn({ new: row });
  }
}

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], _unreadCount: 0 } as never);
});

it('the next member on the phone hears their own notices live, on a channel of their own', async () => {
  mockUser = { id: FIRST, username: 'first' };
  const leaveFirst = useNotificationStore.getState().setupRealtime();
  await settle();
  expect(typeof leaveFirst).toBe('function');

  // The switch: the first member's channel closed and the next one's opened in the same moment.
  if (typeof leaveFirst === 'function') leaveFirst();
  mockUser = { id: NEXT, username: 'next' };
  const leaveNext = useNotificationStore.getState().setupRealtime();
  await answerLeaves();

  // The notices' channel, made once for each member (each member's own notices:<id> topic, round
  // 12, is opened beside it under a name of its own).
  const made = mockMade.filter((w) => w.topic === 'realtime:global_notifications');
  expect(made).toHaveLength(2);
  const theirs = made[1];
  expect(theirs).toBeDefined();
  expect(theirs!.state).toBe('joined');
  arrives(NEXT, '00000000-0000-4000-8000-0000000000a1', 'Your request was admitted.');
  expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['Your request was admitted.']);
  if (typeof leaveNext === 'function') leaveNext();
  await answerLeaves();
});
