/**
 * theHonourStays.test.tsx — "✦ FEATURED IN THE LOBBY · 30 SEPTEMBER" on the page
 * of a piece the house hung, read from the record of editions.
 * ─────────────────────────────────────────────────────────────────────────────
 *   It is asked of the record by the piece's slot and id: FIRST in its slot for
 *   a log or a stack, among the first THREE for a filing; the latest such day.
 *   It is an embellishment: a piece never hung, or a record that cannot be
 *   read, is a page without it — never a hole, never a notice.
 *   A visitor on a shared page is not asked about at all: the record is the
 *   members' (lobby_editions is granted to them alone).
 *   The record is test-utils/supabaseFake's: rows in the table's own shape,
 *   filtered, ordered and limited as PostgREST does it.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { LobbyHonour } from '../LobbyHonour';
import { supabaseFake } from '@/test-utils/supabaseFake';

let mockSignedIn = true;
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ isAuthenticated: mockSignedIn }),
}));

/** The record of editions, as the house holds it. */
let mockHouse = supabaseFake({ rows: { lobby_editions: [] } });
jest.mock('@/src/lib/supabase', () => ({ get supabase() { return mockHouse.client; } }));

const ID = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const AUTHOR = '44444444-4444-4444-8444-444444444444';
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((res) => setTimeout(res, 0)); });
const THIS_YEAR = new Date().getFullYear();
const hung = (edition: string, slot: 'log' | 'list' | 'post', place: number, target = ID) =>
  ({ edition, slot, place, target_id: target, author_id: AUTHOR, score: 10, chosen_at: `${edition}T06:00:00Z` });

beforeEach(() => {
  mockSignedIn = true;
  mockHouse = supabaseFake({ rows: { lobby_editions: [] } });
});

describe('the honour stays', () => {
  it('a log hung first in its slot says the latest such day, and asks the record exactly that', async () => {
    mockHouse = supabaseFake({ rows: { lobby_editions: [
      hung(`${THIS_YEAR}-09-20`, 'log', 1),
      hung(`${THIS_YEAR}-09-30`, 'log', 1),
      hung(`${THIS_YEAR}-10-02`, 'log', 2), // later, but not first in its slot
      hung(`${THIS_YEAR}-10-05`, 'log', 1, OTHER), // first, but another piece
      hung(`${THIS_YEAR}-10-06`, 'list', 1), // first, but another slot
    ] } });
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(r.getByText('✦ FEATURED IN THE LOBBY · 30 SEPTEMBER')).toBeTruthy();
    expect(mockHouse.asked).toEqual([expect.objectContaining({
      table: 'lobby_editions', columns: ['edition'],
      filters: [['eq', 'slot', 'log'], ['eq', 'target_id', ID], ['lte', 'place', 1]],
      order: [['edition', false]], limit: 1, one: 'maybeSingle',
    })]);
  });

  it('a filing counts among the first three', async () => {
    mockHouse = supabaseFake({ rows: { lobby_editions: [hung(`${THIS_YEAR}-09-29`, 'post', 3), hung(`${THIS_YEAR}-09-30`, 'post', 4)] } });
    const r = render(<LobbyHonour kind="post" id={ID} />);
    await settle();
    expect(r.getByText('✦ FEATURED IN THE LOBBY · 29 SEPTEMBER')).toBeTruthy();
    expect(mockHouse.asked[0]?.filters).toContainEqual(['lte', 'place', 3]);
  });

  it('a piece never hung, or a record that cannot be read, is a page without it', async () => {
    mockHouse = supabaseFake({ rows: { lobby_editions: [hung(`${THIS_YEAR}-09-30`, 'list', 2)] } });
    const never = render(<LobbyHonour kind="list" id={ID} />);
    await settle();
    expect(mockHouse.asked).toHaveLength(1); // asked, and answered with nothing
    expect(never.toJSON()).toBeNull();
    never.unmount();
    mockHouse = supabaseFake({ fail: { lobby_editions: { code: 'NETWORK', message: 'Network request failed' } } });
    const failed = render(<LobbyHonour kind="list" id={ID} />);
    await settle();
    expect(failed.toJSON()).toBeNull();
    // Asked once more (retry: 1), then left without it.
    expect(mockHouse.asked).toHaveLength(2);
  });

  it('a visitor is not asked about: nothing is read, nothing is drawn', async () => {
    mockSignedIn = false;
    mockHouse = supabaseFake({ rows: { lobby_editions: [hung(`${THIS_YEAR}-09-30`, 'log', 1)] } });
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(mockHouse.asked).toEqual([]);
    expect(r.toJSON()).toBeNull();
  });

  it('a page with no id yet asks nothing', async () => {
    render(<LobbyHonour kind="log" id={undefined} />);
    await settle();
    expect(mockHouse.asked).toEqual([]);
  });

  it('the day wraps under rather than ending in … (two lines, never one cut)', async () => {
    mockHouse = supabaseFake({ rows: { lobby_editions: [hung('2025-09-02', 'log', 1)] } });
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(r.getByText('✦ FEATURED IN THE LOBBY · 2 SEPTEMBER 2025').props.numberOfLines).toBe(2);
  });
});
