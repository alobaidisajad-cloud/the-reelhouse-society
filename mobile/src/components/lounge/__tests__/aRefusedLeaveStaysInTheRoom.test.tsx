/**
 * aRefusedLeaveStaysInTheRoom.test.tsx — the salon panel leaves only on success.
 *
 * INCINERATE and STEP OUT closed the panel and sent the member to the corridor
 * whatever the house answered. A salon the house would not destroy was still
 * standing behind a "Failed to incinerate" toast, its host thrown out of it;
 * a leave that failed left a member who was still in the room outside it.
 */
import React from 'react';
import { Alert, InteractionManager } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import { LoungeSettingsPanel } from '../LoungeSettingsPanel';
import { useLoungeStore } from '@/src/stores/lounge';
import { useAuthStore } from '@/src/stores/auth';

/** The way home: to the Lounge tab already beneath the room (dismissed to, never replaced). */
const mockHome = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), dismissTo: (...a: unknown[]) => mockHome(...a), back: jest.fn() },
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const leaveLounge = jest.fn(async () => true);
const deleteLounge = jest.fn(async () => true);
const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: 'host', is_private: false, cover_image: null } as never;

beforeEach(() => {
  mockHome.mockClear();
  leaveLounge.mockReset().mockResolvedValue(true);
  deleteLounge.mockReset().mockResolvedValue(true);
  useLoungeStore.setState({ leaveLounge, deleteLounge } as never);
  // The confirming button of every alert is pressed.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { void buttons?.[1]?.onPress?.(); });
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((fn) => { (fn as () => void)(); return { cancel() {} } as never; });
});
afterEach(() => { jest.restoreAllMocks(); });

// The member at the panel holds a seat: STEP OUT is offered only of a row held (review round 10),
// and this panel was drawn over no rows at all.
const ME = { id: 'ada', username: 'ada' };
const panel = (isCreator: boolean, onClose = jest.fn()) => {
  useAuthStore.setState({ user: isCreator ? { id: 'host', username: 'host' } : ME } as never);
  const members = [{ user_id: 'host', status: 'approved', username: 'host' }, { user_id: 'ada', status: 'approved', username: 'ada' }] as never;
  return { onClose, r: render(<LoungeSettingsPanel lounge={room} members={members} visible isCreator={isCreator} onClose={onClose} />) };
};

describe('the salon panel', () => {
  it('stays in the room when the house would not destroy it', async () => {
    deleteLounge.mockResolvedValue(false);
    const { r, onClose } = panel(true);
    await act(async () => { await fireEvent.press(r.getByText('INCINERATE SALON')); });
    expect(deleteLounge).toHaveBeenCalledWith('l1');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('goes to the corridor once it is destroyed', async () => {
    const { r, onClose } = panel(true);
    await act(async () => { await fireEvent.press(r.getByText('INCINERATE SALON')); });
    expect(onClose).toHaveBeenCalled();
    expect(mockHome).toHaveBeenCalledWith('/(tabs)/lounge');
  });

  it('stays in the room when the leave did not take', async () => {
    leaveLounge.mockResolvedValue(false);
    const { r, onClose } = panel(false);
    await act(async () => { await fireEvent.press(r.getByText('STEP OUT OF SALON')); });
    expect(leaveLounge).toHaveBeenCalledWith('l1');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockHome).not.toHaveBeenCalled();
  });

  it('goes to the corridor once the member is out', async () => {
    const { r } = panel(false);
    await act(async () => { await fireEvent.press(r.getByText('STEP OUT OF SALON')); });
    expect(mockHome).toHaveBeenCalledWith('/(tabs)/lounge');
  });
});
