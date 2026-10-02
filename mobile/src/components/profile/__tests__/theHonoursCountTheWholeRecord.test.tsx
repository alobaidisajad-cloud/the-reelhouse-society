/**
 * theHonoursCountTheWholeRecord.test.tsx — SOCIETY HONORS and the passport,
 * earned from the member's whole record.
 *
 * The record (get_public_profile_analytics) was read only for Auteur members,
 * so a visitor to anyone else saw honours and stamps judged from the fifty logs
 * that had loaded: a 300-film member without THE ARCHIVIST or THE ORACLE. THE
 * CRITIC was tested against rows that carry no review, and GENRE EXPLORER
 * against logs that carry no genres, so neither could ever be earned.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Achievements } from '../Achievements';
import { NoirPassport, stampLines, type ProfileAnalyticsPayload } from '../NoirPassport';
import { ProfileDataService } from '@/src/services/ProfileDataService';
import { supabase } from '@/src/lib/supabase';

type Stamps = NonNullable<ProfileAnalyticsPayload['stamps']>;
const record = (over: Partial<Stamps> = {}): ProfileAnalyticsPayload => ({
  stamps: {
    total_logs: 300, pre_1960_count: 25, perfect_ratings_count: 12, has_physical_media: true,
    has_abandoned: true, decades_logged_count: 7, has_rewatched: true,
    reviews_count: 12, genres_count: 6, busiest_day_count: 3, unrated_count: 0,
    ...over,
  },
});
const honour = (r: ReturnType<typeof render>, title: string) =>
  r.getByLabelText(new RegExp(`^${title}, (earned|not yet earned)$`)).props.accessibilityLabel.endsWith(', earned');

describe('every honour is judged from the whole record', () => {
  it('the honours take no logs at all, so the logs that loaded cannot judge one', () => {
    // Three hundred films loaded, a record of three: the record decides.
    const loaded = Array.from({ length: 300 }, (_, i) => ({ id: `l${i}`, rating: 5 }));
    // @ts-expect-error — the record is the only thing the case reads.
    const r = render(<Achievements logs={loaded} analytics={record({ total_logs: 3 })} />);
    expect(honour(r, 'THE ORACLE')).toBe(false);
  });

  it('a 300-film member is THE ORACLE', () => {
    const r = render(<Achievements analytics={record()} />);
    expect(honour(r, 'THE ORACLE')).toBe(true);
  });

  it.each([
    ['THE CRITIC', { reviews_count: 10 }, { reviews_count: 9 }],
    ['GENRE EXPLORER', { genres_count: 5 }, { genres_count: 4 }],
    ['MARATHON RUNNER', { busiest_day_count: 3 }, { busiest_day_count: 2 }],
    ['THE COMPLETIONIST', { unrated_count: 0 }, { unrated_count: 1 }],
    ['THE CONNOISSEUR', { perfect_ratings_count: 5 }, { perfect_ratings_count: 4 }],
    ['DECADE DRIFTER', { decades_logged_count: 4 }, { decades_logged_count: 3 }],
  ] as const)('%s, on the record\'s count', (title, on, off) => {
    expect(honour(render(<Achievements analytics={record(on)} />), title)).toBe(true);
    expect(honour(render(<Achievements analytics={record(off)} />), title)).toBe(false);
  });
});

describe('a record not yet read is said, never guessed', () => {
  it('the honours: retrieving, then could not be reached with the way to ask again', async () => {
    let r = render(<Achievements analytics={null} />);
    expect(r.getByLabelText('Retrieving the honours')).toBeTruthy();
    expect(r.queryByLabelText(/THE ORACLE/)).toBeNull();
    const retry = jest.fn();
    r = render(<Achievements analytics={null} failed onRetry={retry} />);
    expect(r.getByText('The honours could not be reached.')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Ask for the honours again')); });
    expect(retry).toHaveBeenCalled();
  });

  it('the passport: the same', () => {
    expect(render(<NoirPassport analytics={null} />).getByLabelText('Retrieving the passport')).toBeTruthy();
    expect(render(<NoirPassport analytics={null} failed onRetry={jest.fn()} />).getByText('The passport could not be reached.')).toBeTruthy();
  });

  it('the passport stamps from the record (THE DEVOTEE asks 500 films)', () => {
    expect(render(<NoirPassport analytics={record()} />).getByText('7 of 8 STAMPS EARNED')).toBeTruthy();
    expect(render(<NoirPassport analytics={record({ total_logs: 99, has_rewatched: false })} />).getByText('5 of 8 STAMPS EARNED')).toBeTruthy();
  });
});

describe('a stamp\'s label breaks between words', () => {
  it.each([
    ['MASTERPIECE HUNTER', ['MASTERPIECE', 'HUNTER']],
    ['THE COMPLETIONIST', ['THE', 'COMPLETIONIST']],
    ['SILVER SCREEN', ['SILVER SCREEN', '']],
  ] as const)('%s', (label, lines) => {
    expect(stampLines(label)).toEqual(lines);
  });
});

describe('the record is read for every member', () => {
  it('a Cinephile\'s too, and a read that fails says so', async () => {
    const rpc = jest.spyOn(supabase, 'rpc');
    rpc.mockResolvedValueOnce({ data: record(), error: null } as never);
    await expect(ProfileDataService.fetchProfileAnalytics({ id: 'u1', tier: 'cinephile', role: 'cinephile' } as never)).resolves.toEqual(record());
    expect(rpc).toHaveBeenCalledWith('get_public_profile_analytics', { p_user_id: 'u1' });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network request failed' } } as never);
    await expect(ProfileDataService.fetchProfileAnalytics({ id: 'u1' } as never)).rejects.toBeTruthy();
  });
});
