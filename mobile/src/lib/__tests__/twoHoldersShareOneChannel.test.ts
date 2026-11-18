/**
 * twoHoldersShareOneChannel.test.ts — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * Two copies of one salon on the stack (the salon opened again from inside it) each opened its
 * channel under the same name. realtime-js hands the second the channel the first holds, and adding
 * listeners to a channel already joined throws; and when the copy left, its close removed the one
 * channel both were listening on, so the room beneath heard nothing and said it was not live for as
 * long as it stood. openChannel now shares a topic already open with its second holder, never asks
 * `open` for it again, and leaves the channel only when the last holder closes.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabaseFake } from '@/test-utils/supabaseFake';
import { openChannel } from '../openChannel';

/** Each leave asked of the house, answered when the test says. */
const mockLeaves: { channel: unknown; answer: () => void }[] = [];
const mockHouse = supabaseFake({ rows: {} });
function mockWithLeaves(client: typeof mockHouse.client) {
  return {
    ...client,
    removeChannel: (channel: unknown) => new Promise<'ok'>((resolve) => {
      mockLeaves.push({ channel, answer: () => resolve('ok') });
    }),
  };
}
jest.mock('../supabase', () => ({ get supabase() { return mockWithLeaves(mockHouse.client); } }));

let made = 0;
const opener = () => jest.fn((topic: string) => ({ topic, n: ++made }) as unknown as RealtimeChannel);
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const madeBy = (open: jest.Mock): unknown => { const result = open.mock.results[0]; expect(result).toBeDefined(); return result!.value; };

beforeEach(async () => {
  for (const leave of mockLeaves) leave.answer();
  await settle();
  mockLeaves.length = 0;
});

it('a second room opening a salon already open shares its channel: nothing is opened twice', () => {
  const first = opener();
  const second = opener();
  const closeFirst = openChannel('lounge-two-a', first);
  const closeSecond = openChannel('lounge-two-a', second);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  closeFirst();
  closeSecond();
});

it('the copy leaving first never removes the channel the room beneath still listens on', () => {
  const beneath = opener();
  const closeBeneath = openChannel('lounge-two-b', beneath);
  const closeCopy = openChannel('lounge-two-b', opener());
  closeCopy();
  expect(mockLeaves).toHaveLength(0);
  // The last holder leaving takes it, once.
  closeBeneath();
  expect(mockLeaves.map((l) => l.channel)).toEqual([madeBy(beneath)]);
});

it('the room beneath leaving first leaves the channel to the copy', () => {
  const beneath = opener();
  const closeBeneath = openChannel('lounge-two-c', beneath);
  const closeCopy = openChannel('lounge-two-c', opener());
  closeBeneath();
  expect(mockLeaves).toHaveLength(0);
  closeCopy();
  expect(mockLeaves.map((l) => l.channel)).toEqual([madeBy(beneath)]);
});

it('a close asked twice counts once: the other holder keeps the channel', () => {
  const beneath = opener();
  openChannel('lounge-two-d', beneath);
  const closeCopy = openChannel('lounge-two-d', opener());
  closeCopy();
  closeCopy();
  expect(mockLeaves).toHaveLength(0);
});

it('once both have left, the salon opened again waits for the leave and opens a new channel', async () => {
  const first = opener();
  const closeFirst = openChannel('lounge-two-e', first);
  const closeSecond = openChannel('lounge-two-e', opener());
  closeSecond();
  closeFirst();
  const again = opener();
  openChannel('lounge-two-e', again);
  await settle();
  expect(again).not.toHaveBeenCalled();
  const leave = mockLeaves[0];
  expect(leave).toBeDefined();
  leave!.answer();
  await settle();
  expect(again).toHaveBeenCalledTimes(1);
  expect(madeBy(again)).not.toBe(madeBy(first));
});

it('two rooms waiting on the same leave: the first opens, the second shares', async () => {
  openChannel('lounge-two-f', opener())();
  const one = opener();
  const two = opener();
  openChannel('lounge-two-f', one);
  openChannel('lounge-two-f', two);
  const leave = mockLeaves[0];
  expect(leave).toBeDefined();
  leave!.answer();
  await settle();
  expect(one).toHaveBeenCalledTimes(1);
  expect(two).not.toHaveBeenCalled();
});
