/**
 * A locked room shuts when the app leaves, and is covered while it is away (P4.3).
 *
 * The Archive opened behind its lock stayed open after the app went to the background, and the
 * app switcher (iOS) and Recents (Android) kept a picture of it for anyone holding the phone.
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { useArchiveLock } from '../ArchiveLock';
import { useAuthStore } from '@/src/stores/auth';
import { coverWhileAway } from '@/modules/room-cover';

jest.mock('@/modules/room-cover', () => ({ coverWhileAway: jest.fn() }));

const cover = coverWhileAway as jest.Mock;
let mockHeard: ((next: AppStateStatus) => void)[] = [];

beforeEach(() => {
  cover.mockClear();
  mockHeard = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    mockHeard.push(listener as (next: AppStateStatus) => void);
    return { remove: () => { mockHeard = mockHeard.filter((l) => l !== listener); } } as ReturnType<typeof AppState.addEventListener>;
  });
  useAuthStore.setState({ user: { id: 'me', preferences: { biometric_lock: true } } as never });
});
afterEach(() => jest.restoreAllMocks());

const say = (next: AppStateStatus) => act(() => { mockHeard.forEach((l) => l(next)); });

it('shuts again when the app goes to the background, and stays shut on its return', async () => {
  const { result } = await renderHook(() => useArchiveLock(true));
  expect(result.current.locked).toBe(true);
  await act(async () => { result.current.opened(); });
  expect(result.current.locked).toBe(false);

  await say('background');
  await say('active');
  expect(result.current.locked).toBe(true);
});

it('is covered while it stands open, and only then', async () => {
  const { result } = await renderHook(() => useArchiveLock(true));
  expect(cover).not.toHaveBeenCalled();
  await act(async () => { result.current.opened(); });
  expect(cover).toHaveBeenLastCalledWith(true);

  await say('background');
  expect(cover).toHaveBeenLastCalledWith(false);
});

it('a moment away that is not the background (a call, the switcher) leaves it open, covered', async () => {
  const { result } = await renderHook(() => useArchiveLock(true));
  await act(async () => { result.current.opened(); });
  await say('inactive');
  expect(result.current.locked).toBe(false);
  expect(cover).toHaveBeenLastCalledWith(true);
});

it('asks nothing of a file that is not your own, or of a lock that is off', async () => {
  const theirs = await renderHook(() => useArchiveLock(false));
  await act(async () => { theirs.result.current.opened(); });
  expect(theirs.result.current.locked).toBe(false);
  useAuthStore.setState({ user: { id: 'me', preferences: { biometric_lock: false } } as never });
  const off = await renderHook(() => useArchiveLock(true));
  await act(async () => { off.result.current.opened(); });
  expect(off.result.current.locked).toBe(false);
  expect(cover).not.toHaveBeenCalled();
  expect(mockHeard).toEqual([]);
});
