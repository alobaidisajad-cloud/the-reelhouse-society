/**
 * theOracleClosesClean.test.tsx — the watchlist's Oracle.
 *
 * Closed mid-spin, the spin ran on and set its verdict while the Oracle was
 * shut, so it reopened on THE ORACLE HAS SPOKEN about a film nobody saw drawn.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WatchlistRoulette } from '../WatchlistRoulette';

const queue = [
  { id: 603, filmId: 603, title: 'The Matrix', poster_path: null, year: 1999 },
  { id: 680, filmId: 680, title: 'Pulp Fiction', poster_path: null, year: 1994 },
];

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('closed mid-spin, it reopens ready to choose — not on a verdict reached while shut', async () => {
  const onClose = jest.fn();
  const r = render(<WatchlistRoulette visible watchlist={queue} onClose={onClose} />);
  await act(async () => { fireEvent.press(r.getByLabelText('Consult the oracle — pick a film from your watchlist')); });
  await act(async () => { jest.advanceTimersByTime(400); });
  await act(async () => { fireEvent.press(r.getByLabelText('Close the oracle')); });
  expect(onClose).toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(r.queryByText('THE ORACLE HAS SPOKEN')).toBeNull();
  expect(r.getByText('The Oracle\'s Choice')).toBeTruthy();
});

it('the film it lands on is the one it opens', async () => {
  const onSelect = jest.fn();
  const r = render(<WatchlistRoulette visible watchlist={[queue[0]]} onClose={jest.fn()} onSelect={onSelect} />);
  await act(async () => { fireEvent.press(r.getByLabelText('Consult the oracle — pick a film from your watchlist')); });
  await act(async () => { fireEvent.press(r.getByLabelText('See The Matrix')); });
  expect(onSelect).toHaveBeenCalledWith(603);
});
