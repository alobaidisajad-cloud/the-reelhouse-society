/**
 * aRoomLeftIsForgotten.test.tsx — useWritingRoom: a room the member leaves is forgotten; one the
 * phone tears down is kept for the launch that follows.
 *
 * The member leaves a room with the app in front. Android ends a screen ("don't keep activities",
 * a rebuilt screen) only with the app already in the background, and a kill ends no screen at all.
 */
import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useWritingRoom } from '../useWritingRoom';

const mockRooms = { enter: jest.fn(), leave: jest.fn(), stamp: jest.fn() };
jest.mock('@/src/utils/lastRoom', () => ({
  enterRoom: (room: string) => mockRooms.enter(room),
  leaveRoom: (room: string) => mockRooms.leave(room),
  stampRoom: () => mockRooms.stamp(),
}));

let state = 'active';
let listener: ((next: string) => void) | null = null;
beforeEach(() => {
  jest.clearAllMocks();
  state = 'active';
  listener = null;
  Object.defineProperty(AppState, 'currentState', { configurable: true, get: () => state });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (next: string) => void) => {
    listener = fn;
    return { remove: () => { listener = null; } };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

it('is entered as it opens, and stamped each time the app leaves the screen', async () => {
  await renderHook(() => useWritingRoom('edit-profile'));
  expect(mockRooms.enter.mock.calls).toEqual([['edit-profile']]);
  listener?.('background');
  listener?.('active');
  expect(mockRooms.stamp.mock.calls.length).toBe(1);
});

it('is forgotten when it closes with the app in front: the member left it', async () => {
  const { unmount } = await renderHook(() => useWritingRoom('essay'));
  await unmount();
  expect(mockRooms.leave.mock.calls).toEqual([['essay']]);
});

it('is kept when it closes with the app in the background: the phone tore it down', async () => {
  const { unmount } = await renderHook(() => useWritingRoom('log-modal'));
  state = 'background';
  await unmount();
  expect([mockRooms.enter.mock.calls, mockRooms.leave.mock.calls]).toEqual([[['log-modal']], []]);
});

it('is no room at all where it keeps no draft a launch could take up (an edit)', async () => {
  const { unmount } = await renderHook(() => useWritingRoom('log-modal', false));
  await unmount();
  expect([mockRooms.enter.mock.calls.length, mockRooms.leave.mock.calls.length]).toEqual([0, 0]);
});
