/**
 * aBannedMemberKeepsTheirBan.test.tsx — review round 9
 * ─────────────────────────────────────────────────────────────────────────────
 * A host opening a BANNED member's row was offered REMOVE beside UNBAN. The removal deleted the
 * member's row: the ban stood in the house, but the row, and UNBAN with it, was gone for good, the
 * banned member nowhere on the host's roster. And a banned reader was offered STEP OUT OF SALON,
 * which took the same row. Now a banned row offers UNBAN alone, and a banned reader no way out of
 * a seat they do not hold; a member who is not banned keeps REMOVE and STEP OUT as before.
 */
import React from 'react';
import { Alert, InteractionManager } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

import { LoungeSettingsPanel } from '../LoungeSettingsPanel';
import { useLoungeStore } from '@/src/stores/lounge';
import type { LoungeMember } from '@/src/types/social.types';

jest.mock('@/src/stores/auth', () => {
  const { create: mockCreate } = jest.requireActual('zustand');
  return { useAuthStore: mockCreate(() => ({ user: null })) };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn() } }));
jest.mock('@shopify/flash-list', () => require('@/mockups/tabs/flashListMock').makeFlashListMock());

const { useAuthStore } = jest.requireMock('@/src/stores/auth') as {
  useAuthStore: ReturnType<typeof create> & { setState: (s: object) => void };
};

const HOST = 'host';
const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: HOST, is_private: false, cover_image: null } as never;
const seat = (user_id: string, status: LoungeMember['status'], username: string) => ({ user_id, status, username } as LoungeMember);
const removeMember = jest.fn(async () => true);
const setMemberStatus = jest.fn(async () => true);
const leaveLounge = jest.fn(async () => true);

beforeEach(() => {
  removeMember.mockClear();
  setMemberStatus.mockClear();
  leaveLounge.mockClear();
  useLoungeStore.setState({ removeMember, setMemberStatus, leaveLounge } as never);
  // The confirming button of every alert is pressed.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { void buttons?.[1]?.onPress?.(); });
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((fn) => { (fn as () => void)(); return { cancel() {} } as never; });
});
afterEach(() => { jest.restoreAllMocks(); });

/** The panel as `me` sees it, the roster given, a member's row opened by the host. */
async function panel(me: string, members: LoungeMember[], opened?: number) {
  useAuthStore.setState({ user: { id: me, username: me } });
  const r = render(<LoungeSettingsPanel lounge={room} members={members} visible isCreator={me === HOST} onClose={jest.fn()} />);
  if (opened !== undefined) {
    const rows = r.getAllByLabelText('Member actions');
    const row = rows[opened];
    expect(row).toBeDefined();
    await act(async () => { await fireEvent.press(row!); });
  }
  return r;
}

describe('the host, on a banned member’s row', () => {
  it('is offered UNBAN, and no REMOVE that would take the member’s row and the ban’s UNBAN with it; another member’s row keeps REMOVE', async () => {
    const r = await panel(HOST, [seat(HOST, 'approved', 'host'), seat('orson', 'banned', 'orson'), seat('ada', 'approved', 'ada')], 0);
    expect(r.getByText('BANNED')).toBeTruthy();
    expect(r.getByText('UNBAN')).toBeTruthy();
    expect(r.queryByText('REMOVE')).toBeNull();
    await act(async () => { await fireEvent.press(r.getByText('UNBAN')); });
    expect(setMemberStatus).toHaveBeenCalledWith('l1', 'orson', 'approved');
    expect(removeMember).not.toHaveBeenCalled();
    r.unmount();

    // A member who is not banned: REMOVE beside BAN, as before.
    const other = await panel(HOST, [seat(HOST, 'approved', 'host'), seat('orson', 'banned', 'orson'), seat('ada', 'approved', 'ada')], 1);
    expect(other.getByText('BAN')).toBeTruthy();
    expect(other.queryByText('UNBAN')).toBeNull();
    await act(async () => { await fireEvent.press(other.getByText('REMOVE')); });
    expect(removeMember).toHaveBeenCalledWith('l1', 'ada');
  });
});

describe('a reader the host has banned', () => {
  it('is offered no STEP OUT OF SALON, as they hold no seat; a member seated beside them may still step out', async () => {
    const banned = await panel('orson', [seat(HOST, 'approved', 'host'), seat('orson', 'banned', 'orson'), seat('ada', 'approved', 'ada')]);
    expect(banned.queryByText('STEP OUT OF SALON')).toBeNull();
    banned.unmount();

    const seated = await panel('ada', [seat(HOST, 'approved', 'host'), seat('orson', 'banned', 'orson'), seat('ada', 'approved', 'ada')]);
    await act(async () => { await fireEvent.press(seated.getByText('STEP OUT OF SALON')); });
    expect(leaveLounge).toHaveBeenCalledWith('l1');
  });
});
