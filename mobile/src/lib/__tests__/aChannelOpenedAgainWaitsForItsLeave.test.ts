/**
 * aChannelOpenedAgainWaitsForItsLeave.test.ts — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * realtime-js hands back the channel already holding a topic, and a channel being left keeps its
 * topic until the house answers the leave; subscribe() joins only a closed one. A salon joined
 * again in the same moment (a seat taken, a mute, a seat lost) was handed its channel on the way
 * out: nothing joined, no status came, and the room heard nothing. openChannel opens a topic only
 * once its last leave is answered, and never one closed before it opened.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { openChannel } from '../openChannel';

/** Each leave asked of the house, answered (or refused) when the test says. */
const mockLeaves: { channel: unknown; answer: () => void; refuse: () => void }[] = [];
const mockHouse = supabaseFake({ rows: {} });
function mockWithLeaves(client: typeof mockHouse.client) {
  return {
    ...client,
    removeChannel: (channel: unknown) => new Promise<'ok'>((resolve, reject) => {
      mockLeaves.push({ channel, answer: () => resolve('ok'), refuse: () => reject(new Error('the leave timed out')) });
    }),
  };
}
jest.mock('../supabase', () => ({ get supabase() { return mockWithLeaves(mockHouse.client); } }));

let made = 0;
/** A channel opened, as the store's own open makes one: a fresh object each time. */
const opener = () => jest.fn((topic: string) => ({ topic, n: ++made }) as unknown as RealtimeChannel);
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
/** The channel the i-th open made. */
const madeBy = (open: jest.Mock, i = 0): unknown => { const result = open.mock.results[i]; expect(result).toBeDefined(); return result!.value; };
const leaveOf = (i: number) => { const leave = mockLeaves[i]; expect(leave).toBeDefined(); return leave!; };

beforeEach(async () => {
  // Every leave a test left waiting is answered, so no topic stays held into the next test.
  for (const leave of mockLeaves) leave.answer();
  await settle();
  mockLeaves.length = 0;
});

it('a salon opened while nothing of it is leaving opens at once', () => {
  const open = opener();
  const close = openChannel('lounge-a', open);
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('lounge-a');
  close();
  expect(mockLeaves.map((l) => l.channel)).toEqual([madeBy(open)]);
});

it('a salon opened again as it is left waits for the house to answer the leave, then opens a new channel', async () => {
  const first = opener();
  const closeFirst = openChannel('lounge-b', first);
  closeFirst();
  const again = opener();
  const closeAgain = openChannel('lounge-b', again);
  await settle();
  // Not handed the channel on its way out: nothing opened while the leave is unanswered.
  expect(again).not.toHaveBeenCalled();
  leaveOf(0).answer();
  await settle();
  expect(again).toHaveBeenCalledTimes(1);
  expect(madeBy(again)).not.toBe(madeBy(first));
  // And its own close leaves the channel it opened.
  closeAgain();
  expect(leaveOf(1).channel).toBe(madeBy(again));
});

it('a salon closed again before its leave was answered never opens, and asks no second leave', async () => {
  openChannel('lounge-c', opener())();
  const again = opener();
  const closeAgain = openChannel('lounge-c', again);
  closeAgain();
  leaveOf(0).answer();
  await settle();
  expect(again).not.toHaveBeenCalled();
  expect(mockLeaves).toHaveLength(1);
});

it('a leave the house refused still lets the salon open again', async () => {
  openChannel('lounge-d', opener())();
  const again = opener();
  openChannel('lounge-d', again);
  leaveOf(0).refuse();
  await settle();
  expect(again).toHaveBeenCalledTimes(1);
});

it('another salon opens at once while one is being left', () => {
  openChannel('lounge-e', opener())();
  const other = opener();
  openChannel('lounge-f', other);
  expect(other).toHaveBeenCalledTimes(1);
});

it('once the leave is answered, the salon opened later opens at once', async () => {
  openChannel('lounge-g', opener())();
  leaveOf(0).answer();
  await settle();
  const later = opener();
  openChannel('lounge-g', later);
  expect(later).toHaveBeenCalledTimes(1);
});

it('opened, left, opened and left again: the third waits for the latest leave, not the first', async () => {
  openChannel('lounge-h', opener())();
  leaveOf(0).answer();
  await settle();
  openChannel('lounge-h', opener())();
  const third = opener();
  openChannel('lounge-h', third);
  await settle();
  expect(third).not.toHaveBeenCalled();
  leaveOf(1).answer();
  await settle();
  expect(third).toHaveBeenCalledTimes(1);
});
