/**
 * anEmptyLedgerSaysSo.test.tsx — a member whose films are logged, but none
 * rated or written about, has an empty ledger.
 *
 * With no rating chosen, the room said "Nothing at that mark — No entries to
 * show" and offered SHOW EVERY RATING, which every rating already was: a
 * button that did nothing, under a sentence about a filter nobody had set.
 */
import React, { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileLedgerTab from '../ProfileLedgerTab';
import { nav } from '@/src/utils/typedRouter';
import { readCode } from '@/test-utils/readCode';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

const logged = [{ id: 'l1', filmId: 42, title: 'Stalker', year: 1979, rating: 0, review: '', status: 'watched' }] as never[];

const mount = async (over: Record<string, unknown>) => {
  const r = render(
    <ProfileLedgerTab
      logs={logged} ledgerFiltered={[]} ledgerSearch="" setLedgerSearch={jest.fn()}
      ledgerRatingFilter="all" setLedgerRatingFilter={jest.fn()}
      halfLifeMap={{}} groupByMonth={() => ({})}
      {...over}
    />,
  );
  await act(async () => { await Promise.resolve(); });
  return r;
};

it('a visitor is told the ledger is empty, not that a filter found nothing', async () => {
  const r = await mount({ isSelf: false });
  expect(r.getByText('The Ledger is Empty')).toBeTruthy();
  expect(r.queryByText('Nothing at that mark')).toBeNull();
  expect(r.queryByText('SHOW EVERY RATING')).toBeNull();
});

it('and the member is shown their own blank ledger, with the way to fill it', async () => {
  const r = await mount({ isSelf: true });
  expect(r.getByText('A Blank Ledger')).toBeTruthy();
  expect(r.getByLabelText('Draft a critique')).toBeTruthy();
});

/**
 * The way to fill it opens the Log sheet (review round 4): it opened the general search, which has
 * no way to log, so the member had to find the film, open it, and log from there.
 */
it('the way to fill it opens the Log sheet, on its own search', async () => {
  const push = jest.spyOn(nav, 'push').mockImplementation(() => {});
  const r = await mount({ isSelf: true });
  await act(async () => { await fireEvent.press(r.getByLabelText('Draft a critique')); });
  expect(push).toHaveBeenCalledWith('/log-modal');
  push.mockRestore();
});

it("and so do the archive's and the calendar's, the profile's other doors to log a film", () => {
  for (const [file, label] of [
    ['src/components/profile/ProfileArchiveTab.tsx', 'Record a screening'],
    ['src/components/profile/NitrateCalendarGrid.tsx', 'Ignite the timeline — log a film'],
  ]) {
    const line = readCode(file).split('\n').find((l) => l.includes(`accessibilityLabel="${label}"`));
    expect(line).toContain("nav.push('/log-modal')");
  }
});

it('a rating that matched nothing still says so, with the way back', async () => {
  const r = await mount({ isSelf: false, ledgerRatingFilter: 5 });
  expect(r.getByText('Nothing at that mark')).toBeTruthy();
  expect(r.getByText('Nothing in the ledger is rated 5 of 5.')).toBeTruthy();
  expect(r.getByText('SHOW EVERY RATING')).toBeTruthy();
});
