/**
 * aSaveNotYetReadIsUninked.test.tsx — a Darkroom poster's quick save (FilmGridCard,
 * src/components/darkroom/DarkroomCards.tsx) while the member's watchlist is not yet held whole
 * (marksLedger): the bookmark is the outline before the ink, never a confident "not saved". A
 * press is still right (a film already saved is said as saved), so it stays a control.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { FilmGridCard } from '@/src/components/darkroom/DarkroomCards';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { UNINKED } from '@/src/theme/unready';

const film = { id: 603, title: 'The Matrix', poster_path: null, release_date: '1999-03-31', media_type: 'movie' } as never;
/** Drawn, and settled: the poster's own effects land inside act. */
const draw = async () => { let r!: ReturnType<typeof render>; await act(async () => { r = render(<FilmGridCard item={film} />); }); return r; };
const outlines = (r: ReturnType<typeof render>) => (JSON.stringify(r.toJSON()).match(new RegExp(UNINKED, 'g')) ?? []).length;

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1', username: 'me', is_social_private: false } as never, isAuthenticated: true } as never);
});

it('unread: the bookmark is uninked, and still offered', async () => {
  useFilmStore.setState({ _watchlistIndex: {}, _loggedIndex: {}, marksKnown: 'unread' } as never);
  const r = await draw();
  expect(outlines(r)).toBe(1);
  expect(r.getByLabelText('Add The Matrix to watchlist')).toBeTruthy();
});

it('held, or saved, it is drawn plainly', async () => {
  useFilmStore.setState({ _watchlistIndex: {}, _loggedIndex: {}, marksKnown: 'held' } as never);
  expect(outlines(await draw())).toBe(0);
  // The first drawing is still mounted, and hears the store change.
  await act(async () => { useFilmStore.setState({ _watchlistIndex: { 603: true }, marksKnown: 'unread' } as never); });
  const saved = await draw();
  expect(outlines(saved)).toBe(0);
  expect(saved.getByLabelText('Remove The Matrix from watchlist')).toBeTruthy();
});
