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
