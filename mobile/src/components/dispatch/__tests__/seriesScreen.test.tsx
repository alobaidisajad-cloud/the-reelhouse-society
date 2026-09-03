/**
 * seriesScreen.test.tsx — the page that closes the Dispatch's last dead end.
 * ─────────────────────────────────────────────────────────────────────────────
 * `/dispatch/series/[id]` was pushed to from the head of every dossier in a
 * series and no screen existed for it, so the tap landed on Expo Router's
 * not-found page. This mounts the screen that now answers it.
 *
 * Four of these tests exist because the obvious implementation gets them wrong,
 * and each wrong version renders perfectly:
 *
 *   THE READ TIME must come from the essay, not the card. A dossier's `body` is
 *   a 500-character excerpt, so a series built on `FILING_CARD_COLUMNS` prints
 *   `1 MIN` under a forty-minute essay — a fabricated number on the one page
 *   whose whole job is helping somebody choose what to read next.
 *
 *   THE TAP must resolve by position, not by the printed part number. Two parts
 *   a member numbered `2` by hand would otherwise both open the first one.
 *
 *   AN ENDED PART must be asked away at the query. Its title and body are gone
 *   from the row, so it renders as a blank line in a reading list.
 *
 *   AN EMPTY SERIES must be a page, not a header over nothing — which is what
 *   a screen that failed to load looks like.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import SeriesScreen from '@/app/dispatch/series/[id]';

// ── what the router heard ───────────────────────────────────────────────────
// `mock`-prefixed, because jest hoists these factories above every import and
// refuses any other out-of-scope name.
const mockPushed: string[] = [];

jest.mock('@/src/utils/typedRouter', () => ({
  nav: {
    push: (path: string) => { mockPushed.push(path); },
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

// ── the read, and every filter it asked for ─────────────────────────────────
interface Asked {
  columns: string;
  eq: Record<string, unknown>;
  is: Record<string, unknown>;
  order?: [string, unknown];
  limit?: number;
}
let mockAsked: Asked = { columns: '', eq: {}, is: {} };
let mockRows: unknown[] = [];
let mockReadError: unknown = null;

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (c: string) => { mockAsked.columns = c; return self(); };
      chain.eq = (k: string, v: unknown) => { mockAsked.eq[k] = v; return self(); };
      chain.is = (k: string, v: unknown) => { mockAsked.is[k] = v; return self(); };
      chain.order = (k: string, o: unknown) => { mockAsked.order = [k, o]; return self(); };
      chain.limit = (n: number) => {
        mockAsked.limit = n;
        return Promise.resolve({ data: mockRows, error: mockReadError });
      };
      return chain;
    },
  },
}));

/** One published part of a series, in the shape PostgREST returns. */
const part = (over: Record<string, unknown> = {}) => ({
  id: 'p1', kind: 'dossier', user_id: 'u1', author_username: 'tomasreyes',
  title: 'The Empty Room', body: 'An excerpt, five hundred characters at most.',
  full_content: Array.from({ length: 2400 }, () => 'word').join(' '), // 12 MIN
  series_id: 's1', series_title: 'Ozu, in four parts', part_number: 1,
  withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 9, comment_count: 2,
  created_at: '2026-08-28T21:00:00Z', edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'auteur', role: null, is_founding: false },
  ...over,
});

const mount = async () => {
  const r = render(<SeriesScreen />);
  // The read resolves on a microtask; without flushing it, every assertion
  // below would run against the spinner and pass for the wrong reason.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
};

/** The route's own params, for one test. */
const at = (params: Record<string, string | undefined>) => {
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(params);
};

beforeEach(() => {
  mockAsked = { columns: '', eq: {}, is: {} };
  mockRows = [];
  mockReadError = null;
  mockPushed.length = 0;
  at({ id: 's1' });
});

describe('the series page', () => {
  it('lists the parts, in order, under the series title', async () => {
    mockRows = [
      part({ id: 'p1', part_number: 1, title: 'The Empty Room' }),
      part({ id: 'p2', part_number: 2, title: 'A Train Leaves' }),
      part({ id: 'p3', part_number: 3, title: 'Nobody Comes Back' }),
    ];
    const { getByText, queryByText } = await mount();

    expect(getByText('Ozu, in four parts')).toBeTruthy();
    expect(getByText('The Empty Room')).toBeTruthy();
    expect(getByText('A Train Leaves')).toBeTruthy();
    expect(getByText('Nobody Comes Back')).toBeTruthy();

    // The count is what is really there. The title says four; three are written,
    // and the page does not invent the fourth.
    expect(getByText('3 OF 3')).toBeTruthy();
    expect(queryByText(/TO COME/)).toBeNull();
  });

  it('reads the part number from the ROW, and orders by it', async () => {
    mockRows = [part()];
    await mount();
    expect(mockAsked.order?.[0]).toBe('part_number');
    expect(mockAsked.eq.series_id).toBe('s1');
  });

  it('asks for the ESSAY, so the read time is the essay’s', async () => {
    mockRows = [part()];
    const { getByText } = await mount();

    // The card columns would have been enough to render this page, and the read
    // time would have been a lie: 2,400 words is 12 minutes, the excerpt is one.
    expect(mockAsked.columns).toContain('full_content');
    expect(getByText(/12 MIN/)).toBeTruthy();
    expect(getByText(/9 CERTIFIED/)).toBeTruthy();
  });

  it('leaves out what the reader could not open anyway', async () => {
    mockRows = [part()];
    await mount();
    expect(mockAsked.eq.is_published).toBe(true);
    expect(mockAsked.is.withheld_at).toBeNull();
    // An ended part has no title and no words left; a reading list would draw it
    // as a blank row.
    expect(mockAsked.is.ended_at).toBeNull();
    expect(mockAsked.limit).toBe(24);
  });

  it('marks where the reader already is, and only when it knows', async () => {
    mockRows = [part({ id: 'p1', part_number: 1 }), part({ id: 'p2', part_number: 2, title: 'A Train Leaves' })];

    at({ id: 's1', from: 'p2' });
    const withFrom = await mount();
    expect(withFrom.getByText(/YOU ARE HERE/)).toBeTruthy();

    // Reached from anywhere else, nothing is marked — because they are not in
    // any of them.
    at({ id: 's1' });
    const without = await mount();
    expect(without.queryByText(/YOU ARE HERE/)).toBeNull();
  });

  it('opens the part that was actually tapped, not the one numbered like it', async () => {
    // A member numbered two parts `2` by hand. Matching on the printed number
    // would send both taps to the first.
    mockRows = [
      part({ id: 'p1', part_number: 2, title: 'The Empty Room' }),
      part({ id: 'p2', part_number: 2, title: 'A Train Leaves' }),
    ];
    const { getByText } = await mount();

    await act(async () => { fireEvent.press(getByText('A Train Leaves')); });
    expect(mockPushed).toEqual(['/dispatch/p2']);
  });

  it('opens the author’s room from the byline', async () => {
    mockRows = [part()];
    const { getByText } = await mount();
    await act(async () => { fireEvent.press(getByText(/tomasreyes/i)); });
    expect(mockPushed).toEqual(['/user/tomasreyes']);
  });

  it('says so when there is nothing left, rather than showing an empty frame', async () => {
    mockRows = [];
    const { getByText } = await mount();
    expect(getByText('Nothing is left of this series.')).toBeTruthy();
  });

  it('says the same when the read itself fails', async () => {
    mockReadError = { message: 'network' };
    const { getByText } = await mount();
    // Not a blank page, and not a crash. There is no cache to fall back to and
    // nothing partial to show, so the honest page is the empty one.
    expect(getByText('Nothing is left of this series.')).toBeTruthy();
  });
});
