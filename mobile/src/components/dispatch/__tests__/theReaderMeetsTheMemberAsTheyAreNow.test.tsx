/**
 * theReaderMeetsTheMemberAsTheyAreNow.test.tsx — review round 11
 * ─────────────────────────────────────────────────────────────────────────────
 * Two things the reader learned only when it opened, and so never learned:
 *
 *   · A visitor asked in from a filing (CERTIFY, SAVE, a vote) signed in and came back to it, and
 *     every mark stood "Reading your mark", greyed, for good: the marks had been read as nobody,
 *     and nothing read them again for the member.
 *   · A member wrote a critique while the filing's author withdrew it. FILE said only "That
 *     critique did not go.", and the composer stayed open over a filing that takes none.
 *
 * Now a sign-in from nobody reads the filing again for the member, and a refused critique reads
 * the filing again: withdrawn or withheld, the composer closes and the page says why. Driven
 * through the real store and the real reader; only the house is the shared fake.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import FilingReader from '@/app/dispatch/[id]';
import { supabaseFake, type Ask } from '@/test-utils/supabaseFake';
import { readMarksWhenAVisitorSignsIn, useDispatch } from '@/src/stores/dispatch';
import { useAuthStore } from '@/src/stores/auth';
import { clearDraft } from '@/src/utils/memberDrafts';

const ME = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '66666666-6666-4666-8666-666666666666';
const FILING = '00000017-0000-4000-8000-000000000017';
const PEOPLE = [
  { id: AUTHOR, username: 'ozu', member_no: 7, tier: 'free', role: null, is_founding: false, avatar_url: null },
  { id: ME, username: 'kane', member_no: 42, tier: 'free', role: null, is_founding: false, avatar_url: null },
];
const TAKE = {
  id: FILING, kind: 'take', user_id: AUTHOR, author_username: 'ozu', body: 'Ozu never moves the camera.',
  is_published: true, certify_count: 2, comment_count: 0, created_at: '2026-11-16T21:00:00Z',
};
/** Row security's refusal of a critique, as PostgREST hands it back. */
const REFUSED = { code: '42501', message: 'new row violates row-level security policy for table "dispatch_comments"' };

const fresh = (certifiedByMe: boolean) => supabaseFake({
  rows: {
    dispatch_posts: [{ ...TAKE }], profiles: PEOPLE, lobby_editions: [],
    dispatch_certifications: certifiedByMe ? [{ id: '88888888-8888-4888-8888-888888888888', user_id: ME, post_id: FILING }] : [],
    dispatch_saves: [], dispatch_votes: [],
  },
  // The critiques read finds none; a critique filed is refused by the house's rules.
  answer: { dispatch_comments: (ask: Ask) => (ask.op === 'insert' ? REFUSED : []) },
});
let mockHouse = fresh(false);
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('@/src/components/moderation/ReportSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/utils/offlineQueue', () => ({ enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [] }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/utils/askIn', () => ({ askIn: jest.fn() }));
jest.mock('@/src/lib/pushPrimer', () => ({ offerWord: jest.fn() }));

const MEMBER = { id: ME, username: 'kane', member_no: 42, avatar_url: null };
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
};
const mount = async () => {
  const r = render(<FilingReader />);
  await settle();
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  clearDraft(ME, 'critique', FILING);
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue({ id: FILING });
  useDispatch.setState({
    filings: [], opened: {}, critiques: {}, critiquesLoading: {}, critiquesHasMore: {}, critiquesOrder: {},
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    marksKnown: { certified: new Set(), saved: new Set(), voted: new Set() },
    certifiedCritiqueIds: new Set(), critiqueMarksKnown: new Set(),
  } as never);
});

describe('a visitor asked in from a filing', () => {
  let stop: () => void = () => {};
  beforeEach(() => { stop = readMarksWhenAVisitorSignsIn(); });
  afterEach(() => stop());

  it('signed in and back on it, has their marks read: CERTIFY is theirs to press, never "Reading your mark"', async () => {
    useAuthStore.setState({ user: null } as never);
    mockHouse = fresh(true);
    const r = await mount();
    await act(async () => { useAuthStore.setState({ user: MEMBER } as never); });
    await settle();
    expect(r.queryByLabelText(/Reading your mark/)).toBeNull();
    expect(r.getByLabelText(/^Certified\./)).toBeTruthy();
    // Asked as the member, for the member's own marks.
    const asked = mockHouse.asked.filter((a) => a.table === 'dispatch_certifications' && a.filters.some(([op, col, v]) => op === 'eq' && col === 'user_id' && v === ME));
    expect(asked.length).toBeGreaterThan(0);
    r.unmount();
  });
});

describe('a critique filed on a filing that no longer takes one', () => {
  beforeEach(() => { useAuthStore.setState({ user: MEMBER } as never); });

  const writeAndFile = async (r: ReturnType<typeof render>, words: string) => {
    await act(async () => { await fireEvent.press(r.getByLabelText('Write a critique')); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Your critique'), words); });
    await act(async () => { await fireEvent.press(r.getByLabelText('File this critique')); });
    await settle();
  };

  it('withdrawn by its author while it was written: the composer closes, and the page says it takes none', async () => {
    mockHouse = fresh(false);
    const r = await mount();
    // The author withdraws it, as the house's erase leaves it.
    const held = mockHouse.rows('dispatch_posts')[0];
    expect(held).toBeDefined();
    Object.assign(held!, { body: '', ended_at: '2026-11-17T09:00:00Z', ended_by: 'author' });
    await writeAndFile(r, 'Patient, not slow.');
    expect(mockToastError.mock.calls.map(([w]) => w)).toEqual(['This filing no longer takes critiques.']);
    expect(r.queryByLabelText('Your critique')).toBeNull();
    expect(r.queryByLabelText('Write a critique')).toBeNull();
    r.unmount();
  });

  it('withheld by the house meanwhile: the page says it is no longer here', async () => {
    mockHouse = fresh(false);
    const r = await mount();
    // Withheld, the house gives it to no reader but its author.
    mockHouse.rows('dispatch_posts').length = 0;
    await writeAndFile(r, 'Patient, not slow.');
    expect(mockToastError.mock.calls.map(([w]) => w)).toEqual(['This filing no longer takes critiques.']);
    expect(r.getByText('This filing is no longer here.')).toBeTruthy();
    r.unmount();
  });

  it('refused while the filing still stands, is the failure it was, the composer kept with its words', async () => {
    mockHouse = fresh(false);
    const r = await mount();
    await writeAndFile(r, 'Patient, not slow.');
    expect(mockToastError.mock.calls.map(([w]) => w)).toEqual(['That critique did not go.']);
    expect(r.getByLabelText('Your critique').props.value).toBe('Patient, not slow.');
    r.unmount();
  });
});
