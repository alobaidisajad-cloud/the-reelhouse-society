/**
 * theDnaCardReadsTheRecord.test.tsx — the Cinema DNA card.
 *
 * It named its archetype from a second ladder that borrowed the paid ranks'
 * names ("Archivist" at 15 films, to a member who holds no such rank); below
 * five films it drew nothing, so VIEW CINEMA DNA did nothing; it read from the
 * logs in hand when the record had not arrived; with no member number it
 * printed the film count as one; and its OBSCURITY INDEX was worked out from
 * the average rating and the film count, not from the films.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CinemaDNACard } from '../CinemaDNACard';
import type { ProfileAnalyticsPayload } from '../NoirPassport';
import { obscurityScore } from '@/src/lib/tmdb';

const record = (total: number, obscurity: number | null = 73): ProfileAnalyticsPayload => ({
  stamps: {
    total_logs: total, pre_1960_count: 0, perfect_ratings_count: 0, has_physical_media: false,
    has_abandoned: false, decades_logged_count: 3, has_rewatched: false,
    reviews_count: 0, genres_count: 0, busiest_day_count: 0, unrated_count: 0,
  },
  dna: { avg_rating: 3.6, top_decades: [{ '1970s': 40 }, { '1990s': 30 }], obscurity_index: obscurity, obscurity_films: obscurity === null ? 0 : 118 },
});

it('names the standing from the house\'s one ladder, never a paid rank', () => {
  const r = render(<CinemaDNACard user={{ username: 'vesper', member_no: 42 }} analytics={record(120)} onClose={jest.fn()} />);
  expect(r.getByText('THE ORACLE')).toBeTruthy();
  expect(r.queryByText('Archivist')).toBeNull();
  expect(r.getByText('MEMBER Nº 0042')).toBeTruthy();
});

it('the OBSCURITY INDEX is the record\'s measure of the films, and with none measured says none', () => {
  // The old sum for this record was 40 + (5 − 3.6) × 12 + 30 = 87.
  expect(render(<CinemaDNACard user={{ username: 'vesper' }} analytics={record(120)} onClose={jest.fn()} />).getByText('73')).toBeTruthy();
  const r = render(<CinemaDNACard user={{ username: 'vesper' }} analytics={record(120, null)} onClose={jest.fn()} />);
  expect(r.queryByText('87')).toBeNull();
  // A dash is a mark, not a word: drawn, and kept from the screen reader.
  expect(r.getAllByText('—', { includeHiddenElements: true }).length).toBeGreaterThan(0);
});

it('the film page\'s mark is the one the record averages (the rehearsal reads the same four from the database)', () => {
  expect([5000, 1, 0, Math.sqrt(5000)].map((popularity) => obscurityScore({ popularity }))).toEqual([2, 99, 99, 51]);
});

it('with no member number on file, invents none', () => {
  const r = render(<CinemaDNACard user={{ username: 'vesper', member_no: null }} analytics={record(120)} onClose={jest.fn()} />);
  // The card is drawn, reading in full; only the number it does not have is missing.
  expect(r.getByText('THE ORACLE')).toBeTruthy();
  expect(r.queryByText(/CASE №|MEMBER Nº/)).toBeNull();
});

it('below five films it opens, says what a reading needs, and closes', async () => {
  const onClose = jest.fn();
  const r = render(<CinemaDNACard user={{ username: 'vesper' }} analytics={record(3)} onClose={onClose} />);
  expect(r.getByText('A reading needs 5 films; 3 are logged.')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByLabelText('Close cinema DNA')); });
  expect(onClose).toHaveBeenCalled();
});

it('until the record is read it says so — and if it could not be, offers to ask again', async () => {
  expect(render(<CinemaDNACard user={{}} analytics={null} onClose={jest.fn()} />).getByLabelText('Retrieving the reading')).toBeTruthy();
  const retry = jest.fn();
  const r = render(<CinemaDNACard user={{}} analytics={null} failed onRetry={retry} onClose={jest.fn()} />);
  expect(r.getByText('The reading could not be reached.')).toBeTruthy();
  await act(async () => { fireEvent.press(r.getByLabelText('Ask for the reading again')); });
  expect(retry).toHaveBeenCalled();
});
