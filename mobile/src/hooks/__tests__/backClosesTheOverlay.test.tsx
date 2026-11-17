/**
 * Android's back closes an overlay drawn inside its screen, not the screen beneath (P4.12).
 *
 * The hook itself, and the two overlays that had no back of their own: the portrait's crop sheet
 * over Edit Profile, and the Cinema DNA card over a member's file. Each press is heard newest first.
 */
import React from 'react';
import { BackHandler } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';
import { useBackCloses } from '../useBackCloses';
import AvatarCropSheet from '@/src/components/profile/AvatarCropSheet';
import { CinemaDNACard } from '@/src/components/profile/CinemaDNACard';

jest.mock('@/src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }));
/** Whether the overlay's screen is the one in front (false: a page has been pushed over it). */
let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  useIsFocused: () => mockFocused,
}));

type Heard = () => boolean | null | undefined;
let mockHeard: Heard[] = [];

beforeEach(() => {
  mockHeard = [];
  mockFocused = true;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    mockHeard.unshift(handler as Heard);
    return { remove: () => { mockHeard = mockHeard.filter((h) => h !== handler); } };
  });
});
afterEach(() => jest.restoreAllMocks());

/** Android's back: the newest subscriber first, until one says it took the press. */
const pressBack = () => act(() => { mockHeard.some((h) => h() === true); });

it('closes the overlay while it is open, and lets the press go when it is not', async () => {
  const close = jest.fn();
  const hook = await renderHook(({ open }: { open: boolean }) => useBackCloses(open, close), { initialProps: { open: true } });
  await pressBack();
  expect(close).toHaveBeenCalledTimes(1);

  await hook.rerender({ open: false });
  expect(mockHeard).toEqual([]);
});

it('the newest overlay closes first', async () => {
  const under = jest.fn();
  const over = jest.fn();
  await renderHook(() => useBackCloses(true, under));
  await renderHook(() => useBackCloses(true, over));
  await pressBack();
  expect(over).toHaveBeenCalledTimes(1);
  expect(under).not.toHaveBeenCalled();
});

it('the crop sheet and the Cinema DNA card each close on back', async () => {
  const cropClosed = jest.fn();
  const crop = await render(<AvatarCropSheet onClose={cropClosed} onSuccess={jest.fn()} />);
  await pressBack();
  expect(cropClosed).toHaveBeenCalledTimes(1);
  await crop.unmount();

  const cardClosed = jest.fn();
  await render(<CinemaDNACard user={{ username: 'kane' }} onClose={cardClosed} />);
  await pressBack();
  expect(cardClosed).toHaveBeenCalledTimes(1);
});

/**
 * Review round 8: a page pushed over the screen (a filing opened from the Archive's film, a
 * critic's file from a stack's critiques) left the overlay's subscription standing, newer than the
 * navigator's, so the first back on that page closed the overlay hidden beneath it and the page
 * stayed. Only the screen in front hears the press.
 */
describe('a page pushed over the overlay', () => {
  it('back on the page above does not close the overlay hidden beneath it', async () => {
    mockFocused = false;
    const close = jest.fn();
    await renderHook(() => useBackCloses(true, close));
    expect(mockHeard).toEqual([]);
    await pressBack();
    expect(close).not.toHaveBeenCalled();
  });

  it('an overlay open when a page is pushed over it lets the press go, and takes it again once its screen is in front', async () => {
    const close = jest.fn();
    const hook = await renderHook(() => useBackCloses(true, close));
    expect(mockHeard).toHaveLength(1);

    mockFocused = false;
    await hook.rerender({});
    expect(mockHeard).toEqual([]);
    await pressBack();
    expect(close).not.toHaveBeenCalled();

    mockFocused = true;
    await hook.rerender({});
    await pressBack();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
