/**
 * theRosterIsKeptForThoseSeated.test.tsx — review round 10 (C4)
 * ─────────────────────────────────────────────────────────────────────────────
 * The house gives a salon's roster to its host and its seated (a muted member keeps their seat).
 * Anyone else is given their own row at most, and the salon's sheet drew what it was given: a guest
 * read "MEMBERS (1)" over a full salon, a pending reader "MEMBERS (0)", and a guest who held no seat
 * was offered STEP OUT OF SALON. Now one who does not read the roster is told the salon's own count
 * and "The roster is kept for those seated.", drawn no rows, and offered STEP OUT only of a row
 * they hold. The host and the seated, muted too, see the roster as before.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
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
/** A salon of twelve, as the house counts it. */
const room = { id: 'l1', name: 'The Nitrate Circle', description: '', creator_id: HOST, is_private: true, cover_image: null, member_count: 12 } as never;
const seat = (user_id: string, status: LoungeMember['status'], username: string) => ({ user_id, status, username } as LoungeMember);
/** The roster whole, as the house gives it to the host and the seated. */
const WHOLE = [seat(HOST, 'approved', 'host'), seat('ada', 'approved', 'ada'), seat('orson', 'muted', 'orson'), seat('mae', 'banned', 'mae')];
const KEPT = 'The roster is kept for those seated.';

beforeEach(() => {
  useLoungeStore.setState({ removeMember: jest.fn(), setMemberStatus: jest.fn(), leaveLounge: jest.fn(async () => true) } as never);
});

/** The sheet as `me` sees it, with the rows the house gave them. */
function sheet(me: string, members: LoungeMember[]) {
  useAuthStore.setState({ user: { id: me, username: me } });
  return render(<LoungeSettingsPanel lounge={room} members={members} visible isCreator={me === HOST} onClose={jest.fn()} />);
}
/**
 * Which of these words the sheet shows, each true or false: a miss is said in a line, never as
 * the whole drawn sheet (a failing find prints the tree, and this one's printing ran out of memory).
 */
const shows = (r: ReturnType<typeof sheet>, words: string[]) => words.map((w) => [w, r.queryByText(w) !== null]);

it('a guest with no seat is told the salon’s count and that the roster is kept for those seated, and is offered no STEP OUT', () => {
  // A guest is given the rows the house lets anyone read: here, the host's alone.
  const r = sheet('guest', [seat(HOST, 'approved', 'host')]);
  expect(shows(r, ['MEMBERS (12)', KEPT, '@HOST', 'MEMBERS (1)', 'STEP OUT OF SALON'])).toEqual([
    ['MEMBERS (12)', true], [KEPT, true], ['@HOST', false], ['MEMBERS (1)', false], ['STEP OUT OF SALON', false],
  ]);
});

it('a reader at the door (pending) is told the salon’s count, drawn no rows, and may step out of the row they hold', () => {
  const r = sheet('pat', [seat('pat', 'pending', 'pat')]);
  expect(shows(r, ['MEMBERS (12)', KEPT, '@PAT', 'MEMBERS (0)', 'STEP OUT OF SALON'])).toEqual([
    ['MEMBERS (12)', true], [KEPT, true], ['@PAT', false], ['MEMBERS (0)', false], ['STEP OUT OF SALON', true],
  ]);
});

it('a banned reader is told the salon’s count, drawn not even their own row, and offered no STEP OUT', () => {
  const r = sheet('mae', [seat('mae', 'banned', 'mae')]);
  expect(shows(r, ['MEMBERS (12)', KEPT, '@MAE', 'BANNED', 'STEP OUT OF SALON'])).toEqual([
    ['MEMBERS (12)', true], [KEPT, true], ['@MAE', false], ['BANNED', false], ['STEP OUT OF SALON', false],
  ]);
});

it('the host and the seated, muted too, see the roster whole, never told it is kept; a guest beside them is', () => {
  for (const me of [HOST, 'ada', 'orson']) {
    const r = sheet(me, WHOLE);
    const way = me === HOST ? 'INCINERATE SALON' : 'STEP OUT OF SALON';
    expect(shows(r, ['MEMBERS (4)', '@HOST', '@ADA', '@ORSON', '@MAE', KEPT, way])).toEqual([
      ['MEMBERS (4)', true], ['@HOST', true], ['@ADA', true], ['@ORSON', true], ['@MAE', true], [KEPT, false], [way, true],
    ]);
    r.unmount();
  }
  const guest = sheet('guest', WHOLE);
  expect(shows(guest, ['MEMBERS (12)', 'MEMBERS (4)', '@ADA', KEPT])).toEqual([
    ['MEMBERS (12)', true], ['MEMBERS (4)', false], ['@ADA', false], [KEPT, true],
  ]);
});
