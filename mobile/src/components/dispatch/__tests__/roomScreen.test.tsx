/**
 * roomScreen.test.tsx — the room a byline has been promising all along.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every byline in the Dispatch carries the accessibility label "Open their
 * room." It opened the member FILE — the profile, six rooms about films, not one
 * of them the Dispatch — so the paper's only gesture toward a person led out of
 * the paper, and the words on the control were a promise the app did not keep.
 *
 * These tests exist because each of them has an implementation that renders
 * perfectly and is wrong:
 *
 *   THE HEAD must not be read off the first filing. It is free that way, and a
 *   member who has filed NOTHING then opens their own room to no name, no face
 *   and no rank above the words "nothing filed yet".
 *
 *   THE TOTALS must come from the server. Summed from the page on screen they
 *   would shrink as you scroll, and `certified` is a sum across everything a
 *   member has ever filed.
 *
 *   THE HANDLE must be matched with `eq`. Nothing constrains the characters in
 *   a handle, so `_` and `%` are legal in one — and in a LIKE pattern they are
 *   wildcards. `ilike` on a member called `a_b` matches `aab` too, and
 *   `maybeSingle` turns two matches into an error: that member's room would
 *   simply never have opened.
 *
 *   THE MARKS must be fetched. The store fills them in for the feed's rows and
 *   the reader's, privately; a room fetches its own page, so without asking, a
 *   member opens their own room, sees nothing certified, taps a mark that is
 *   already true, and the insert comes back a duplicate.
 *
 *   THE COUNT must follow the store's set rather than an optimistic ±1, or a
 *   refused write leaves the room one ahead of the house for ever.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import RoomScreen from '@/app/dispatch/room/[username]';
import { useDispatch } from '@/src/stores/dispatch';

// ── who is looking ──────────────────────────────────────────────────────────
let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));

// ── where it went ───────────────────────────────────────────────────────────
const mockPushed: string[] = [];
const mockBack = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({
  nav: {
    push: (path: string) => { mockPushed.push(path); },
    replace: jest.fn(),
    back: () => mockBack(),
  },
}));

// ── what it asked the database ──────────────────────────────────────────────
interface Asked {
  table: string;
  columns: string;
  eq: Record<string, unknown>;
  ilike: Record<string, unknown>;
  is: Record<string, unknown>;
  order?: [string, unknown];
  range?: [number, number];
}
let mockAsked: Asked[] = [];
let mockMember: Record<string, unknown> | null = null;
let mockMemberError: unknown = null;
let mockRows: unknown[] = [];
let mockTotals: { filed: number; certified: number } | null = null;
let mockRpcCalls: { name: string; args: unknown }[] = [];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const asked: Asked = { table, columns: '', eq: {}, ilike: {}, is: {} };
      mockAsked.push(asked);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (c: string) => { asked.columns = c; return self(); };
      chain.eq = (k: string, v: unknown) => { asked.eq[k] = v; return self(); };
      chain.ilike = (k: string, v: unknown) => { asked.ilike[k] = v; return self(); };
      chain.is = (k: string, v: unknown) => { asked.is[k] = v; return self(); };
      chain.order = (k: string, o: unknown) => { asked.order = [k, o]; return self(); };
      chain.maybeSingle = () => Promise.resolve({ data: mockMember, error: mockMemberError });
      chain.range = (a: number, b: number) => {
        asked.range = [a, b];
        return Promise.resolve({ data: mockRows, error: null });
      };
      // The store's own three reads for the member's marks.
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.insert = () => Promise.resolve({ data: [], error: null });
      chain.delete = () => self();
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: (name: string, args: unknown) => {
      mockRpcCalls.push({ name, args });
      return Promise.resolve({ data: mockTotals ? [mockTotals] : null, error: null });
    },
  },
}));

jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

/** A local date, so a month boundary means the same in every timezone. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const member = (over: Record<string, unknown> = {}) => ({
  id: 'u2', username: 'tomasreyes', avatar_url: null, member_no: 147,
  tier: 'auteur', role: null, is_founding: false, ...over,
});

/** One filing of theirs, in the shape PostgREST returns. */
const filing = (over: Record<string, unknown> = {}) => ({
  id: 'f1', kind: 'take', user_id: 'u2', author_username: 'tomasreyes',
  title: null, body: 'A take about a film.',
  source: null, source_url: null, options: null, closes_at: null,
  frozen_totals: null, answer_id: null,
  series_id: null, series_title: null, part_number: null,
  spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
  certify_count: 5, comment_count: 1,
  created_at: at(2026, 8, 28, 21), edited_at: null,
  profiles: { username: 'tomasreyes', member_no: 147, tier: 'auteur', role: null, is_founding: false },
  ...over,
});

const store = (over: Record<string, unknown> = {}) => {
  useDispatch.setState({
    filings: [], loading: false, loadingMore: false, hasMore: false, droppedRows: 0,
    section: 'ALL', sort: 'LATEST', savedOnly: false, newCount: 0,
    certifiedIds: new Set(), savedIds: new Set(), myVotes: {},
    critiques: {}, critiquesLoading: {}, critiquesLoadingMore: {},
    critiquesHasMore: {}, critiquesOrder: {}, certifiedCritiqueIds: new Set(),
    ...over,
  } as never);
};

const mount = async () => {
  const r = render(<RoomScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  // FlashList measures itself and sets state AFTER that first settle, so one
  // tick leaves its update outside act and React says so. A second settle costs
  // nothing and means the screen the assertions run against has fully arrived.
  await act(async () => { await Promise.resolve(); });
  return r;
};

const at_route = (params: Record<string, string | undefined>) => {
  (useLocalSearchParams as unknown as jest.Mock).mockReturnValue(params);
};

beforeEach(() => {
  mockAsked = [];
  mockMember = member();
  mockMemberError = null;
  mockRows = [];
  mockTotals = { filed: 12, certified: 340 };
  mockRpcCalls = [];
  mockPushed.length = 0;
  mockBack.mockClear();
  mockUser = { id: 'u1', username: 'me' };
  store();
  at_route({ username: 'tomasreyes' });
});

const posts = () => mockAsked.find((a) => a.table === 'dispatch_posts');
const profiles = () => mockAsked.find((a) => a.table === 'profiles');

describe('a member’s room', () => {
  it('names the member once, at the head, with what they have done', async () => {
    mockRows = [filing()];
    const { getAllByText, getByText } = await mount();

    // The bar and the head. The house NUMBER is printed once, by the head — a
    // screen saying `No. 147` twice in its top forty points is shouting a serial.
    expect(getAllByText('TOMASREYES')).toHaveLength(2);
    expect(getByText('No. 147')).toBeTruthy();
    // From the RPC, not from the page: `certified` is a sum across everything
    // they have ever filed, and this page holds one filing worth five.
    expect(getByText(/12 FILED/)).toBeTruthy();
    expect(getByText(/340 CERTIFIED/)).toBeTruthy();
    expect(mockRpcCalls[0]).toEqual({ name: 'dispatch_room_totals', args: { p_user_id: 'u2' } });
  });

  it('draws the head for a member who has filed nothing', async () => {
    // The whole reason the head is not read off the first filing. There is no
    // first filing here, and this is the member most likely to be looking.
    mockRows = [];
    mockTotals = { filed: 0, certified: 0 };
    const { getAllByText, getByText } = await mount();
    expect(getAllByText('TOMASREYES')).toHaveLength(2);
    expect(getByText(/0 FILED/)).toBeTruthy();
    expect(getByText('Nothing filed yet.')).toBeTruthy();
  });

  it('prints no totals at all rather than zeros it did not get', async () => {
    // The function is unreachable — a network failure, or a build running ahead
    // of the migration that creates it. `0 FILED · 0 CERTIFIED` over a member's
    // twelve filings is the page inventing a number; the line is not drawn.
    mockTotals = null;
    mockRows = [filing()];
    const { queryByText, getAllByText } = await mount();
    expect(queryByText(/FILED/)).toBeNull();
    expect(queryByText(/CERTIFIED ·|· \d+ CERTIFIED/)).toBeNull();
    // And the rest of the head is unharmed: a missing total is not a missing
    // member.
    expect(getAllByText('TOMASREYES')).toHaveLength(2);
    expect(queryByText('No. 147')).toBeTruthy();
  });

  it('offers the owner the way to write in it, and offers nobody else one', async () => {
    mockRows = [];
    mockTotals = { filed: 0, certified: 0 };

    const stranger = await mount();
    expect(stranger.queryByText('FILE SOMETHING')).toBeNull();

    mockUser = { id: 'u2', username: 'tomasreyes' };
    const own = await mount();
    expect(own.getByText('You have filed nothing yet.')).toBeTruthy();
    await fireEvent.press(own.getByText('FILE SOMETHING'));
    expect(mockPushed).toContain('/dispatch/compose');
  });

  it('prints no byline on the entries — the head already said whose they are', async () => {
    mockRows = [
      filing({ id: 'f1' }),
      filing({ id: 'f2', body: 'Another take.' }),
      filing({ id: 'f3', body: 'A third take.' }),
    ];
    const { getAllByText } = await mount();
    /**
     * Twice, and only twice: the bar, which is chrome and says where you are
     * once the head has scrolled away, and the head itself.
     *
     * THREE filings, deliberately — with a byline on each the count would be
     * five, and a fixture of one or two could not tell "the head" apart from
     * "the first entry".
     */
    expect(getAllByText('TOMASREYES')).toHaveLength(2);
  });

  it('indexes by month and year, and puts the day in the margin', async () => {
    mockRows = [
      filing({ id: 'f1', created_at: at(2026, 8, 28) }),
      filing({ id: 'f2', created_at: at(2026, 8, 3) }),
      filing({ id: 'f3', created_at: at(2025, 3, 9) }),
    ];
    const { getByText, queryByText } = await mount();

    // The year is the point: a room runs back far enough that `MONDAY, MARCH 3`
    // appears twice with nothing to tell the two apart.
    expect(getByText('MARCH 2025')).toBeTruthy();
    // Not above the first — the head is already the top of the page.
    expect(queryByText('AUGUST 2026')).toBeNull();

    expect(getByText('28')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('9')).toBeTruthy();
  });

  it('asks only for what the paper itself would show, newest first', async () => {
    mockRows = [filing()];
    await mount();
    const q = posts();
    expect(q?.eq.user_id).toBe('u2');
    expect(q?.eq.is_published).toBe(true);
    expect(q?.is.withheld_at).toBeNull();
    expect(q?.is.ended_at).toBeNull();
    expect(q?.order?.[0]).toBe('created_at');
    expect(q?.order?.[1]).toEqual({ ascending: false });
    expect(q?.range).toEqual([0, 19]);
    // The card's columns. A room of essays asking for `full_content` would be
    // twenty essays' worth of text to draw twenty openings.
    expect(q?.columns).not.toContain('full_content');
  });

  it('matches the handle exactly, because a handle may contain a wildcard', async () => {
    await mount();
    expect(profiles()?.eq.username).toBe('tomasreyes');
    // `ilike` would make `a_b` match `aab`, and two matches through
    // `maybeSingle` is an error, not a room.
    expect(profiles()?.ilike).toEqual({});
  });

  it('fetches the member’s own marks for a page it fetched itself', async () => {
    mockRows = [filing()];
    await mount();
    // The store's three reads, which no other screen would have made for these
    // rows. Without them every mark draws empty on a member's own room.
    expect(mockAsked.some((a) => a.table === 'dispatch_certifications')).toBe(true);
    expect(mockAsked.some((a) => a.table === 'dispatch_saves')).toBe(true);
  });

  it('moves the count when the mark moves, and puts it back when the write fails', async () => {
    mockRows = [filing({ certify_count: 5 })];
    const { getByLabelText, queryByLabelText } = await mount();

    // Not certified: five is the house's total and the label does not carry it.
    expect(getByLabelText('Certify this')).toBeTruthy();

    // Certified — six, immediately.
    await act(async () => { store({ certifiedIds: new Set(['f1']) }); });
    expect(getByLabelText(/6 members have certified this/)).toBeTruthy();

    // The write is refused and the store rolls its set back. The count has to
    // come back with it; an optimistic +1 held on this screen would not.
    await act(async () => { store({ certifiedIds: new Set() }); });
    expect(queryByLabelText(/members have certified this/)).toBeNull();
    expect(getByLabelText('Certify this')).toBeTruthy();
  });

  it('does not count the member’s own certification twice', async () => {
    // The server total ALREADY includes it. A screen that added one for "mine"
    // would print six for a filing five members certified.
    store({ certifiedIds: new Set(['f1']) });
    mockRows = [filing({ certify_count: 5 })];
    const { getByLabelText } = await mount();
    expect(getByLabelText(/5 members have certified this/)).toBeTruthy();
  });

  it('opens a filing, and the member’s file, and goes back', async () => {
    mockRows = [filing()];
    const { getByText, getByLabelText } = await mount();

    await fireEvent.press(getByText(/A take about a film/));
    expect(mockPushed).toContain('/dispatch/f1');

    mockPushed.length = 0;
    await fireEvent.press(getByText('THE MEMBER’S FILE'));
    // This room is one of seven. The other six are films, and they are still
    // one tap away.
    expect(mockPushed).toEqual(['/user/tomasreyes']);

    await fireEvent.press(getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('says so when the name on the door belongs to nobody', async () => {
    mockMember = null;
    const { getByText } = await mount();
    expect(getByText('No such member.')).toBeTruthy();
    // And it never asked for filings it had no member to ask about.
    expect(posts()).toBeUndefined();
  });

  it('says the same when the read itself fails', async () => {
    mockMemberError = { message: 'network' };
    const { getByText } = await mount();
    // Not a spinner that never stops. There is no cache to fall back on and
    // nothing partial to draw, so the honest page is the one that says so.
    expect(getByText('No such member.')).toBeTruthy();
  });

  it('asks nothing at all without a name', async () => {
    at_route({ username: undefined });
    await mount();
    expect(mockAsked).toEqual([]);
  });
});
