/**
 * aRoomThePhoneClosedOpensAgain.test.ts — the writing room a launch reopens (lastRoom.ts).
 * ─────────────────────────────────────────────────────────────────────────────
 * The phone ended the app with the member's words unsaved in a writing room (killed in the
 * background, its screen rebuilt): a launch within the half hour opens the room again, and the
 * room takes up its draft. Only the member's own draft, only while it is there, and never a room
 * the member left themselves.
 */
import { LAST_ROOM_KEY, enterRoom, leaveRoom, roomToReopen, ROOMS, stampRoom } from '../lastRoom';
import { RETURN_WITHIN_MS } from '../lastTab';
import { draftKey } from '../memberDrafts';

const mockStore = new Map<string, string>();
let mockFull = false;
jest.mock('@/src/stores/mmkv-storage', () => ({
  isStorageEncrypted: () => true,
  storage: {
    set: (k: string, v: string) => { if (mockFull) throw new Error('no space left on device'); mockStore.set(k, v); },
    getString: (k: string) => mockStore.get(k),
    delete: (k: string) => { if (mockFull) throw new Error('no space left on device'); mockStore.delete(k); },
  },
}));

const T = 1_800_000_000_000;
const ANNA = 'a1';
const draftOf = (member: string, room: keyof typeof ROOMS) =>
  mockStore.set(draftKey(member, ROOMS[room].draft), JSON.stringify({ v: 2, savedAt: new Date(T).toISOString(), data: { bio: 'half' } }));
beforeEach(() => { mockStore.clear(); mockFull = false; });

it('opens again within the half hour, while its draft is there', () => {
  enterRoom('edit-profile', T);
  draftOf(ANNA, 'edit-profile');
  expect(roomToReopen(ANNA, T + 5 * 60 * 1000)).toBe('edit-profile');
  expect(roomToReopen(ANNA, T + RETURN_WITHIN_MS)).toBe('edit-profile');
});

it('never without the draft: saved, discarded or started clean, there is nothing to take up', () => {
  enterRoom('log-modal', T);
  expect(roomToReopen(ANNA, T + 1000)).toBeNull();
});

it('never for another member: the draft is the member\'s own', () => {
  enterRoom('essay', T);
  draftOf(ANNA, 'essay');
  expect([roomToReopen('b2', T + 1000), roomToReopen(null, T + 1000)]).toEqual([null, null]);
});

it('not after the half hour, which runs from the app\'s last use', () => {
  enterRoom('edit-profile', T);
  draftOf(ANNA, 'edit-profile');
  expect(roomToReopen(ANNA, T + RETURN_WITHIN_MS + 1)).toBeNull();
  stampRoom(T + 2 * 60 * 60 * 1000);
  expect(roomToReopen(ANNA, T + 2 * 60 * 60 * 1000 + 10 * 60 * 1000)).toBe('edit-profile');
});

it('forgets a room the member left, and only that room', () => {
  enterRoom('edit-profile', T);
  draftOf(ANNA, 'edit-profile');
  draftOf(ANNA, 'log-modal');
  leaveRoom('log-modal');
  expect(roomToReopen(ANNA, T + 1000)).toBe('edit-profile');
  leaveRoom('edit-profile');
  expect(roomToReopen(ANNA, T + 1000)).toBeNull();
});

it('a clock gone backwards, an unknown room or a value it cannot read reopens nothing', () => {
  draftOf(ANNA, 'edit-profile');
  enterRoom('edit-profile', T);
  expect(roomToReopen(ANNA, T - 60_000)).toBeNull();
  mockStore.set(LAST_ROOM_KEY, '{not json');
  expect(roomToReopen(ANNA, T)).toBeNull();
  mockStore.set(LAST_ROOM_KEY, JSON.stringify({ room: 'settings', at: T }));
  expect(roomToReopen(ANNA, T)).toBeNull();
});

it('on a phone with no room left, remembers nothing and throws nothing: the room it is in still opens', () => {
  mockFull = true;
  expect(() => { enterRoom('essay', T); stampRoom(T + 1); leaveRoom('essay'); }).not.toThrow();
  expect(mockStore.has(LAST_ROOM_KEY)).toBe(false);
});

it('names a page of the app for every room, and a draft kind each takes up', () => {
  expect(Object.entries(ROOMS).map(([room, { href, draft }]) => [room, href, draft])).toEqual([
    ['edit-profile', '/edit-profile', 'profile'],
    ['log-modal', '/log-modal', 'log'],
    ['essay', '/dispatch/compose?kind=dossier', 'dossier'],
  ]);
});
