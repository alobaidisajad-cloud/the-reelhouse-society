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
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';
import { LobbyHonour } from '../LobbyHonour';

let mockSignedIn = true;
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ isAuthenticated: mockSignedIn }),
}));

/** What the page asked the record, and what the record answers. */
let mockAsked: [string, ...unknown[]][] = [];
let mockAnswer: { data: unknown; error: unknown } = { data: null, error: null };
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockAsked.push(['from', table]);
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'lte', 'order', 'limit']) {
        chain[k] = (...args: unknown[]) => { mockAsked.push([k, ...args]); return chain; };
      }
      chain.maybeSingle = async () => mockAnswer;
      return chain;
    },
  },
}));

const ID = '22222222-2222-4222-8222-222222222222';
const settle = () => act(async () => { for (let i = 0; i < 6; i++) await new Promise((res) => setTimeout(res, 0)); });
const THIS_YEAR = new Date().getFullYear();

beforeEach(() => {
  mockSignedIn = true;
  mockAsked = [];
  mockAnswer = { data: null, error: null };
});

describe('the honour stays', () => {
  it('a log hung first in its slot says the day, and asks the record exactly that', async () => {
    mockAnswer = { data: { edition: `${THIS_YEAR}-09-30` }, error: null };
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(r.getByText('✦ FEATURED IN THE LOBBY · 30 SEPTEMBER')).toBeTruthy();
    expect(mockAsked).toEqual([
      ['from', 'lobby_editions'], ['select', 'edition'], ['eq', 'slot', 'log'], ['eq', 'target_id', ID],
      ['lte', 'place', 1], ['order', 'edition', { ascending: false }], ['limit', 1],
    ]);
  });

  it('a filing counts among the first three', async () => {
    mockAnswer = { data: { edition: `${THIS_YEAR}-09-29` }, error: null };
    render(<LobbyHonour kind="post" id={ID} />);
    await settle();
    expect(mockAsked).toContainEqual(['lte', 'place', 3]);
  });

  it('a piece never hung, or a record that cannot be read, is a page without it', async () => {
    const never = render(<LobbyHonour kind="list" id={ID} />);
    await settle();
    expect(never.toJSON()).toBeNull();
    never.unmount();
    mockAnswer = { data: null, error: { message: 'Network request failed' } };
    const failed = render(<LobbyHonour kind="list" id={ID} />);
    await settle();
    expect(failed.toJSON()).toBeNull();
  });

  it('a visitor is not asked about: nothing is read, nothing is drawn', async () => {
    mockSignedIn = false;
    mockAnswer = { data: { edition: `${THIS_YEAR}-09-30` }, error: null };
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(mockAsked).toEqual([]);
    expect(r.toJSON()).toBeNull();
  });

  it('a page with no id yet asks nothing', async () => {
    render(<LobbyHonour kind="log" id={undefined} />);
    await settle();
    expect(mockAsked).toEqual([]);
  });

  it('the day wraps under rather than ending in … (two lines, never one cut)', async () => {
    mockAnswer = { data: { edition: '2025-09-02' }, error: null };
    const r = render(<LobbyHonour kind="log" id={ID} />);
    await settle();
    expect(r.getByText('✦ FEATURED IN THE LOBBY · 2 SEPTEMBER 2025').props.numberOfLines).toBe(2);
  });
});
