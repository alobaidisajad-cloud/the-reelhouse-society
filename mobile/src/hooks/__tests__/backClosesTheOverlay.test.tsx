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

type Heard = () => boolean | null | undefined;
let mockHeard: Heard[] = [];

beforeEach(() => {
  mockHeard = [];
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
