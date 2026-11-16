/**
 * aDeleteSaysWhatItTakes.test.tsx — review round 6 (LogForm, useLogFlow)
 * ───────────────────────────────────────────────────────────────────────
 * DELETE THIS ENTIRE LOG asked the store for a viewing's removal, so on a record watched again it
 * took the latest viewing alone, under "this log is gone for good", and the record stood. Now the
 * whole record goes, and says so of every viewing in it; a record watched again also offers
 * REMOVE THIS VIEWING (the record steps back to the one before), with its own question. A viewing
 * that cannot be named without a connection is said, and the sheet stays on its question.
 *
 * The real sheet (log-modal: the flow and the form); the store's removeLog is what is asked.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { VIEWING_NEEDS_CONNECTION } from '@/src/stores/domain/logSlice/helpers/logOperations';
import reelToast from '@/src/utils/reelToast';
import { nav } from '@/src/utils/typedRouter';

import LogModalScreen from '@/app/(modals)/log-modal';

jest.mock('@/src/lib/tmdb', () => {
  const actual = jest.requireActual('@/src/lib/tmdb');
  return {
    ...actual,
    tmdb: {
      ...actual.tmdb,
      movieImages: jest.fn().mockResolvedValue({ posters: [], backdrops: [] }),
      movie: jest.fn().mockResolvedValue({}),
    },
  };
});

type R = ReturnType<typeof render>;
const ME = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '00000015-0000-4000-8000-000000000015';
const ONCE = {
  id: LOG_ID, viewingId: 'v-2', filmId: 843, title: 'In the Mood for Love', poster: '/mood.jpg', year: 2000,
  status: 'watched', rating: 4.5, review: 'Rain on the stairs.', isSpoiler: false,
  watchedDate: '2026-08-16', viewCount: 1, viewingHistory: [],
};
const TWICE = {
  ...ONCE, viewCount: 2, status: 'rewatched',
  viewingHistory: [{ viewingId: 'v-1', date: '2024-02-01', rating: 4, review: 'The first time.', status: 'watched' }],
};

const AS_BUILT = useFilmStore.getState();
const removeLog = jest.fn((..._a: unknown[]) => Promise.resolve());

async function open(record: typeof ONCE | typeof TWICE): Promise<R> {
  await act(async () => {
    useAuthStore.setState({ user: { id: ME, username: 'sajjadobaidi', tier: 'auteur', role: 'cinephile', is_social_private: false } as never, isAuthenticated: true } as never);
    useFilmStore.setState({ logs: [record], _loggedIndex: {}, removeLog } as never);
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: LOG_ID });
  let r!: R;
  await act(async () => { r = render(<LogModalScreen />); });
  return r;
}
const press = async (node: Parameters<typeof fireEvent.press>[0]) => { await act(async () => { await fireEvent.press(node); }); };
/** What the first removal asked of the store: the record, and whether all of it. */
const asked = () => {
  const first = removeLog.mock.calls[0];
  expect(first).toBeDefined();
  return first!.slice(0, 2);
};

let said: jest.SpyInstance;
let back: jest.SpyInstance;
beforeEach(() => {
  removeLog.mockReset();
  removeLog.mockImplementation(() => Promise.resolve());
  said = jest.spyOn(reelToast, 'error').mockImplementation(() => {});
  back = jest.spyOn(nav, 'back').mockImplementation(() => {});
});
afterEach(() => {
  said.mockRestore();
  back.mockRestore();
  useFilmStore.setState({ removeLog: AS_BUILT.removeLog, logs: [], _loggedIndex: {} } as never);
});

it('a record watched once: DELETE THIS ENTIRE LOG deletes the whole record, and no viewing is offered alone', async () => {
  const r = await open(ONCE);
  expect(r.queryByLabelText('Remove this viewing')).toBeNull();
  await press(r.getByLabelText('Delete this entire log'));
  expect(r.getByText('DELETE THIS LOG? THIS CANNOT BE UNDONE.')).toBeTruthy();
  await press(r.getByLabelText('Confirm delete: this log is gone for good'));
  expect(removeLog).toHaveBeenCalledTimes(1);
  expect(asked()).toEqual([LOG_ID, true]);
});

it('a record watched again: DELETE THIS ENTIRE LOG says every viewing goes, and takes the whole record', async () => {
  const r = await open(TWICE);
  await press(r.getByLabelText('Delete this entire log'));
  expect(r.getByText('DELETE THIS LOG AND EVERY VIEWING IN IT? THIS CANNOT BE UNDONE.')).toBeTruthy();
  await press(r.getByLabelText('Confirm delete: this log is gone for good'));
  expect(removeLog).toHaveBeenCalledTimes(1);
  expect(asked()).toEqual([LOG_ID, true]);
});

it('a record watched again offers REMOVE THIS VIEWING, asked on its own, which takes the latest viewing alone', async () => {
  const r = await open(TWICE);
  await press(r.getByLabelText('Remove this viewing'));
  expect(r.getByText('REMOVE THIS VIEWING? THE RECORD STEPS BACK TO THE ONE BEFORE.')).toBeTruthy();
  // One question at a time: the whole record's is not asked beside it.
  expect(r.queryByLabelText('Confirm delete: this log is gone for good')).toBeNull();
  await press(r.getByLabelText('Cancel: keep this viewing'));
  expect(r.queryByText('REMOVE THIS VIEWING? THE RECORD STEPS BACK TO THE ONE BEFORE.')).toBeNull();
  expect(removeLog).not.toHaveBeenCalled();

  await press(r.getByLabelText('Remove this viewing'));
  await press(r.getByLabelText('Confirm: remove this viewing, the record steps back to the one before'));
  expect(removeLog).toHaveBeenCalledTimes(1);
  expect(asked()).toEqual([LOG_ID, false]);
});

it('a viewing that cannot be named without a connection is said, and the sheet stays on its question', async () => {
  removeLog.mockImplementation(() => Promise.reject(new Error(VIEWING_NEEDS_CONNECTION)));
  const r = await open(TWICE);
  await press(r.getByLabelText('Remove this viewing'));
  await press(r.getByLabelText('Confirm: remove this viewing, the record steps back to the one before'));
  expect(said).toHaveBeenCalledWith('Removing a viewing needs a connection.');
  expect(r.getByText('REMOVE THIS VIEWING? THE RECORD STEPS BACK TO THE ONE BEFORE.')).toBeTruthy();
  expect(back).not.toHaveBeenCalled();
});

/**
 * Review round 7: a removal pressed again while the first was on its way was a second removal.
 * The first had already stepped the record back, so a second REMOVE IT found no earlier viewing
 * and deleted the whole record. Now the press waits, busy, until the first is answered; a removal
 * that fails gives it back.
 */
describe('a removal on its way is not asked for twice', () => {
  /** The store's removal, held on the wire until the test lets it land or fail. */
  const holdRemoval = () => {
    let land: () => void = () => {};
    let fail: (e: Error) => void = () => {};
    removeLog.mockImplementation(() => new Promise<void>((res, rej) => { land = res; fail = rej; }));
    return { land: () => land(), fail: (e: Error) => fail(e) };
  };
  const REMOVE_IT = 'Confirm: remove this viewing, the record steps back to the one before';
  const CONFIRM_DELETE = 'Confirm delete: this log is gone for good';

  it('REMOVE IT tapped twice in one breath removes the latest viewing once, never the whole record after it', async () => {
    const removal = holdRemoval();
    const r = await open(TWICE);
    await press(r.getByLabelText('Remove this viewing'));
    const yes = r.getByLabelText(REMOVE_IT);
    // Both taps land before the sheet is drawn again: only the removal's own mark can turn the second away.
    await act(async () => { await Promise.all([fireEvent.press(yes), fireEvent.press(yes)]); });
    expect(removeLog).toHaveBeenCalledTimes(1);
    expect(asked()).toEqual([LOG_ID, false]);
    await act(async () => { removal.land(); });
  });

  it('while a viewing is being removed, its press reads REMOVING…, busy, and neither it nor CANCEL can be pressed', async () => {
    const removal = holdRemoval();
    const r = await open(TWICE);
    await press(r.getByLabelText('Remove this viewing'));
    await press(r.getByLabelText(REMOVE_IT));
    expect(r.getByText('REMOVING…')).toBeTruthy();
    expect(r.queryByText('REMOVE IT')).toBeNull();
    expect(r.getByLabelText(REMOVE_IT).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(r.getByLabelText('Cancel: keep this viewing').props.accessibilityState).toMatchObject({ disabled: true });

    await press(r.getByLabelText(REMOVE_IT));
    await press(r.getByLabelText('Cancel: keep this viewing'));
    expect(removeLog).toHaveBeenCalledTimes(1);
    // CANCEL did not take the question away from under the removal.
    expect(r.getByText('REMOVE THIS VIEWING? THE RECORD STEPS BACK TO THE ONE BEFORE.')).toBeTruthy();
    await act(async () => { removal.land(); });
  });

  it('while the whole log is being deleted, CONFIRM DELETE reads DELETING…, busy, and a second press deletes nothing more', async () => {
    const removal = holdRemoval();
    const r = await open(ONCE);
    await press(r.getByLabelText('Delete this entire log'));
    await press(r.getByLabelText(CONFIRM_DELETE));
    expect(r.getByText('DELETING…')).toBeTruthy();
    expect(r.queryByText('CONFIRM DELETE')).toBeNull();
    expect(r.getByLabelText(CONFIRM_DELETE).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(r.getByLabelText('Cancel: keep this log').props.accessibilityState).toMatchObject({ disabled: true });

    await press(r.getByLabelText(CONFIRM_DELETE));
    expect(removeLog).toHaveBeenCalledTimes(1);
    expect(asked()).toEqual([LOG_ID, true]);
    await act(async () => { removal.land(); });
  });

  it('a removal that fails gives the press back: it reads REMOVE IT again, and a second press asks again', async () => {
    const removal = holdRemoval();
    const r = await open(TWICE);
    await press(r.getByLabelText('Remove this viewing'));
    await press(r.getByLabelText(REMOVE_IT));
    expect(r.getByText('REMOVING…')).toBeTruthy();

    await act(async () => { removal.fail(new Error('permission denied for table logs')); });
    expect(said).toHaveBeenCalledWith('The viewing could not be removed. Try again.');
    expect(r.getByText('REMOVE IT')).toBeTruthy();
    expect(r.getByLabelText(REMOVE_IT).props.accessibilityState).toMatchObject({ disabled: false, busy: false });
    expect(back).not.toHaveBeenCalled();

    removeLog.mockImplementation(() => Promise.resolve());
    // Asked again a second later, as a person would: a press within 400 ms of the last is one tap
    // (PressableScale's debounce, on the forward clock, waits.ts).
    const later = performance.now() + 1000;
    const clock = jest.spyOn(performance, 'now').mockReturnValue(later);
    try {
      await press(r.getByLabelText(REMOVE_IT));
    } finally {
      clock.mockRestore();
    }
    expect(removeLog).toHaveBeenCalledTimes(2);
  });
});
