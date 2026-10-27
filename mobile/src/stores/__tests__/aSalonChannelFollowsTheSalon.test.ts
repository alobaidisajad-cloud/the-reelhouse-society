/**
 * A salon's channel is joined privately, presence comes from a seat alone, and
 * typing goes through the house.
 * ─────────────────────────────────────────────────────────────────────────────
 * The server decides who receives a private join of a salon's channel
 * (realtime.messages' rules); here the app's half: it asks for a private join,
 * tracks presence only when seated, and sends typing only by calling
 * send_salon_typing, which stamps the sender's own id.
 */
import { useLoungeStore } from '../lounge';

const SALON = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';

const mockRpc = jest.fn();
const joined: { topic: string; opts: Record<string, unknown>; track: jest.Mock; send: jest.Mock; live: (s: string) => void }[] = [];
const mockRemove = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: (...a: unknown[]) => mockRpc(...a),
    removeChannel: (...a: unknown[]) => mockRemove(...a),
    channel: (topic: string, opts: Record<string, unknown>) => {
      const ch: Record<string, unknown> = {};
      const entry = { topic, opts, track: jest.fn(), send: jest.fn(), live: (_s: string) => {} };
      ch.on = () => ch;
      ch.subscribe = (cb: (s: string) => void) => { entry.live = cb; return ch; };
      ch.track = entry.track;
      ch.send = entry.send;
      ch.presenceState = () => ({});
      joined.push(entry);
      return ch;
    },
  },
}));
jest.mock('../auth', () => ({ useAuthStore: { getState: () => ({ user: { id: ME, username: 'me' } }) } }));
jest.mock('../resetAllStores', () => ({ registerStoreReset: jest.fn() }));
jest.mock('../blockStore', () => ({ useBlockStore: { getState: () => ({ isHidden: () => false }) } }));
jest.mock('../../utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('../../lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));

let now = 1_000_000;
beforeEach(() => {
  joined.length = 0;
  mockRpc.mockReset().mockResolvedValue({ data: true, error: null });
  mockRemove.mockReset();
  now += 10_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  useLoungeStore.setState({ currentLoungeId: SALON, typingUsers: [], presentCount: 0 } as never);
});
afterEach(() => jest.restoreAllMocks());

it('joins the salon\'s channel privately', () => {
  const leave = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  expect(joined.map((j) => [j.topic, (j.opts.config as Record<string, unknown>).private])).toEqual([[`lounge-${SALON}`, true]]);
  leave();
});

it('a seated member shares presence once the channel is live; a reader without a seat never does', () => {
  const leaveSeated = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  joined[0].live('SUBSCRIBED');
  expect(joined[0].track).toHaveBeenCalledWith({ username: 'me' });
  leaveSeated();
  const leaveReader = useLoungeStore.getState().subscribeToLounge(SALON, { seated: false });
  joined[1].live('SUBSCRIBED');
  expect(joined[1].track).not.toHaveBeenCalled();
  leaveReader();
});

it('typing goes through send_salon_typing, at most once in 2 s, and never down the channel', () => {
  const leave = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  const { broadcastTyping } = useLoungeStore.getState();
  broadcastTyping(SALON);
  broadcastTyping(SALON);
  now += 1_999;
  broadcastTyping(SALON);
  now += 1;
  broadcastTyping(SALON);
  expect(mockRpc.mock.calls).toEqual([
    ['send_salon_typing', { p_lounge_id: SALON }],
    ['send_salon_typing', { p_lounge_id: SALON }],
  ]);
  expect(joined[0].send).not.toHaveBeenCalled();
  leave();
});

it('a reader without a seat sends no typing, and none is sent once the channel is left', () => {
  const leaveReader = useLoungeStore.getState().subscribeToLounge(SALON, { seated: false });
  useLoungeStore.getState().broadcastTyping(SALON);
  leaveReader();
  const leaveSeated = useLoungeStore.getState().subscribeToLounge(SALON, { seated: true });
  leaveSeated();
  now += 5_000;
  useLoungeStore.getState().broadcastTyping(SALON);
  expect(mockRpc).not.toHaveBeenCalled();
  expect(mockRemove).toHaveBeenCalledTimes(2);
});
