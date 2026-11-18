/**
 * aSeatedMemberKeepsTheirSeatBeforeTheRoster.test.tsx — review round 12
 * ─────────────────────────────────────────────────────────────────────────────
 * The salon's settings judged the seat from the roster's rows alone. A seated member who opened
 * them before the roster was read (just after TAKE A SEAT), or after the read failed (a weak
 * connection, the room drawn from what the corridor knew), was told "The roster is kept for those
 * seated." and offered no STEP OUT OF SALON. Now the settings take the standing the room acts on:
 * seated, the member is offered STEP OUT, and the list says it is being read, or that it could not
 * be read, with TRY AGAIN. A guest is still told the roster is kept for those seated.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { create } from 'zustand';

import { LoungeSettingsPanel } from '../LoungeSettingsPanel';
import type { RoomStanding } from '../roomGate';
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
const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: HOST, is_private: false, cover_image: null, member_count: 12 } as never;
const KEPT = 'The roster is kept for those seated.';
const READING = 'Reading the roster…';
const FAILED = 'The roster could not be read.';
const STEP_OUT = 'STEP OUT OF SALON';

beforeEach(() => {
  useLoungeStore.setState({ removeMember: jest.fn(), setMemberStatus: jest.fn(), leaveLounge: jest.fn(async () => true) } as never);
  useAuthStore.setState({ user: { id: 'ada', username: 'ada' } });
});

function sheet(standing: RoomStanding, opts: { members?: LoungeMember[]; failed?: boolean; retry?: () => void } = {}) {
  return render(
    <LoungeSettingsPanel lounge={room} members={opts.members ?? []} visible isCreator={false} standing={standing}
      rosterFailed={opts.failed} onRetryRoster={opts.retry} onClose={jest.fn()} />,
  );
}
const shows = (r: ReturnType<typeof sheet>, words: string[]) => words.map((w) => [w, r.queryByText(w) !== null]);

it('a seated member before the roster is read is told it is being read, never that it is kept from them, and may step out', async () => {
  for (const standing of ['approved', 'muted'] as const) {
    const r = sheet(standing);
    expect(shows(r, ['MEMBERS (12)', READING, KEPT, FAILED, STEP_OUT])).toEqual([
      ['MEMBERS (12)', true], [READING, true], [KEPT, false], [FAILED, false], [STEP_OUT, true],
    ]);
    await r.unmount();
  }
});

it('a seated member whose roster could not be read is told so, with TRY AGAIN, and may step out', async () => {
  const retry = jest.fn();
  const r = sheet('approved', { failed: true, retry });
  expect(shows(r, [FAILED, KEPT, READING, STEP_OUT])).toEqual([
    [FAILED, true], [KEPT, false], [READING, false], [STEP_OUT, true],
  ]);
  await act(async () => { await fireEvent.press(r.getByLabelText('Try again: read the roster')); });
  expect(retry).toHaveBeenCalledTimes(1);
  await r.unmount();
});

it('a member whose standing is not yet known is never told they are a guest, and is offered no STEP OUT', async () => {
  const r = sheet('unknown');
  expect(shows(r, [READING, KEPT, STEP_OUT])).toEqual([[READING, true], [KEPT, false], [STEP_OUT, false]]);
  await r.unmount();
});

it('a guest, at the door or banned, is still told the roster is kept for those seated', async () => {
  const seen: (string | boolean)[][] = [];
  for (const standing of ['none', 'pending', 'banned'] as const) {
    const r = sheet(standing);
    seen.push([standing, r.queryByText(KEPT) !== null, r.queryByText(STEP_OUT) !== null]);
    await r.unmount();
  }
  // Only a request at the door is a row to step out of.
  expect(seen).toEqual([['none', true, false], ['pending', true, true], ['banned', true, false]]);
});

it('read, the seated member is drawn the roster whole', async () => {
  const members = [{ user_id: HOST, status: 'approved', username: 'host' }, { user_id: 'ada', status: 'approved', username: 'ada' }] as LoungeMember[];
  const r = sheet('approved', { members });
  expect(shows(r, ['MEMBERS (2)', '@HOST', '@ADA', READING, KEPT, STEP_OUT])).toEqual([
    ['MEMBERS (2)', true], ['@HOST', true], ['@ADA', true], [READING, false], [KEPT, false], [STEP_OUT, true],
  ]);
  await r.unmount();
});
