/**
 * yourQueueOpensItsFilms.test.tsx — a poster in your own watchlist opens its film.
 *
 * Your queue's items carried the film's number only as `id`, and the poster
 * opens `filmId`: every poster in your own watchlist was a tap that did
 * nothing (a visitor's, read from the server with `filmId`, worked).
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ProfilePosterCard } from '../ProfilePosterCard';
import { toProfileWatchlistItem } from '@/src/utils/mappers';
import { nav } from '@/src/utils/typedRouter';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), back: jest.fn() } }));

it('a film from your own queue opens', async () => {
  const item = toProfileWatchlistItem({ id: 603, title: 'The Matrix', poster: null, year: 1999 });
  const r = render(<ProfilePosterCard item={item} width={100} />);
  await act(async () => { fireEvent.press(r.getByLabelText('The Matrix, 1999')); });
  expect(nav.push).toHaveBeenCalledWith('/film/603');
});
