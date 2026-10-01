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

const mockReplace = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
}));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const leaveLounge = jest.fn(async () => true);
const deleteLounge = jest.fn(async () => true);
const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: 'host', is_private: false, cover_image: null } as never;

beforeEach(() => {
  mockReplace.mockClear();
  leaveLounge.mockReset().mockResolvedValue(true);
  deleteLounge.mockReset().mockResolvedValue(true);
  useLoungeStore.setState({ leaveLounge, deleteLounge } as never);
  // The confirming button of every alert is pressed.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { void buttons?.[1]?.onPress?.(); });
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((fn) => { (fn as () => void)(); return { cancel() {} } as never; });
});
afterEach(() => { jest.restoreAllMocks(); });

const panel = (isCreator: boolean, onClose = jest.fn()) => ({
  onClose,
  r: render(<LoungeSettingsPanel lounge={room} members={[]} visible isCreator={isCreator} onClose={onClose} />),
});

describe('the salon panel', () => {
  it('stays in the room when the house would not destroy it', async () => {
    deleteLounge.mockResolvedValue(false);
    const { r, onClose } = panel(true);
    await act(async () => { fireEvent.press(r.getByText('INCINERATE SALON')); });
    expect(deleteLounge).toHaveBeenCalledWith('l1');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to the corridor once it is destroyed', async () => {
    const { r, onClose } = panel(true);
    await act(async () => { fireEvent.press(r.getByText('INCINERATE SALON')); });
    expect(onClose).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/lounge');
  });

  it('stays in the room when the leave did not take', async () => {
    leaveLounge.mockResolvedValue(false);
    const { r, onClose } = panel(false);
    await act(async () => { fireEvent.press(r.getByText('STEP OUT OF SALON')); });
    expect(leaveLounge).toHaveBeenCalledWith('l1');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to the corridor once the member is out', async () => {
    const { r } = panel(false);
    await act(async () => { fireEvent.press(r.getByText('STEP OUT OF SALON')); });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/lounge');
  });
});
