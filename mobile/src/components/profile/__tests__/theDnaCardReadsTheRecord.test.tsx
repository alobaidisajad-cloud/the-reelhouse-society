/**
 * theDnaCardReadsTheRecord.test.tsx — the Cinema DNA card.
 *
 * It named its archetype from a second ladder that borrowed the paid ranks'
 * names ("Archivist" at 15 films, to a member who holds no such rank); below
 * five films it drew nothing, so VIEW CINEMA DNA did nothing; it read from the
 * logs in hand when the record had not arrived; and with no member number it
 * printed the film count as one.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CinemaDNACard } from '../CinemaDNACard';
import type { ProfileAnalyticsPayload } from '../NoirPassport';

const record = (total: number): ProfileAnalyticsPayload => ({
  stamps: {
    total_logs: total, pre_1960_count: 0, perfect_ratings_count: 0, has_physical_media: false,
    has_abandoned: false, decades_logged_count: 3, has_rewatched: false,
  },
  dna: { avg_rating: 3.6, top_decades: [{ '1970s': 40 }, { '1990s': 30 }] },
});

it('names the standing from the house\'s one ladder, never a paid rank', () => {
  const r = render(<CinemaDNACard user={{ username: 'vesper', member_no: 42 }} analytics={record(120)} onClose={jest.fn()} />);
  expect(r.getByText('THE ORACLE')).toBeTruthy();
  expect(r.queryByText('Archivist')).toBeNull();
  expect(r.getByText('MEMBER Nº 0042')).toBeTruthy();
});

it('with no member number on file, invents none', () => {
  const r = render(<CinemaDNACard user={{ username: 'vesper', member_no: null }} analytics={record(120)} onClose={jest.fn()} />);
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
