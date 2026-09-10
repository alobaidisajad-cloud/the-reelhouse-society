/**
 * zz-memberroom.gen.test.tsx — the REAL member's room, rendered.
 *
 * A GENERATOR, not a test. Run: npx jest zz-memberroom.gen
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The room was typechecked and unit-tested before it was ever drawn, and this
 * project's standing lesson is that a passing test says the code does what the
 * test asked and nothing at all about whether a member can read the screen.
 *
 * It mounts the SCREEN — the same component the router hands a member — with
 * the head at its very widest: the longest plausible name, an Auteur's mark, a
 * five-figure house number and four-figure counts. One plate; the record's own
 * harness applies the accessibility multiplier to it, and ×1.0 proves nothing
 * on its own, because this head is the narrowest container in the app and the
 * byline in it has a floor it cannot shrink past.
 *
 * ── WHAT THIS PLATE CANNOT MEASURE, AND WHERE THAT IS DONE ──────────────────
 * The ENTRIES. They are inside a FlashList, and the test renderer has no layout
 * engine — every cell comes out zero points wide, so a row could be drawn
 * straight off the page here and measure clean. That is not a fault to fix in
 * the screen; it is what mounting a virtualised list outside a device means.
 *
 * The entries are measured on `f5-member-room`, which draws the same
 * components — `PaperRoom`, a divider, three `PaperPost noByline` — laid out
 * directly rather than through a list. Both plates were measured at ×1.0 and
 * ×1.35: nothing overflows and nothing clips.
 *
 * So this plate is the head, the way out, the empty and missing pages, and the
 * closing mark — the furniture the room ADDS — rendered by the real screen
 * against real replies. That is the half a design plate cannot check.
 */
import React from 'react';
import { render, act } from '@testing-library/react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({ username: 'tomasreyes' }),
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', username: 'ana' }, isAuthenticated: true };
      return sel ? sel(state) : state;
    },
    { getState: () => ({ user: { id: 'u1', username: 'ana' } }) },
  ),
}));

/**
 * The member with the longest plausible name, an Auteur's mark, a five-figure
 * house number and four-figure counts — the head at its very widest, which is
 * the only version of it worth measuring.
 */
const mockMember = {
  id: 'u2', username: 'tomasreyesmendoza', avatar_url: null, member_no: 10248,
  tier: 'auteur', role: null, is_founding: false,
};

const mockRows = [
  {
    id: 'f1', kind: 'take', user_id: 'u2', author_username: 'tomasreyesmendoza',
    title: null,
    body: 'Every frame of it is a man deciding not to say the thing, and the film '
      + 'is patient enough to let him not say it for two hours.',
    source: null, source_url: null, options: null, closes_at: null,
    frozen_totals: null, answer_id: null,
    series_id: null, series_title: null, part_number: null,
    spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
    certify_count: 2140, comment_count: 61,
    created_at: new Date(2026, 7, 28, 21).toISOString(),
    edited_at: null,
    profiles: { username: 'tomasreyesmendoza', member_no: 10248, tier: 'auteur', role: null, is_founding: false },
  },
  {
    id: 'f2', kind: 'dossier', user_id: 'u2', author_username: 'tomasreyesmendoza',
    title: 'The Long Silence in Ozu',
    body: 'An excerpt of the essay, as the card holds it.',
    source: null, source_url: null, options: null, closes_at: null,
    frozen_totals: null, answer_id: null,
    series_id: 's1', series_title: 'Ozu, in four parts', part_number: 2,
    spoiler_label: null, withheld_at: null, ended_at: null, ended_by: null,
    certify_count: 61, comment_count: 14,
    created_at: new Date(2025, 2, 9, 11).toISOString(),
    edited_at: null,
    profiles: { username: 'tomasreyesmendoza', member_no: 10248, tier: 'auteur', role: null, is_founding: false },
  },
];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self(); chain.is = () => self(); chain.order = () => self();
      chain.maybeSingle = () => Promise.resolve({ data: mockMember, error: null });
      chain.range = () => Promise.resolve({ data: mockRows, error: null });
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: [{ filed: 128, certified: 4102 }], error: null }),
  },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));

import RoomScreen from '@/app/dispatch/room/[username]';

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'out');

describe('a member’s room', () => {
  it('renders the real screen to html, at both text sizes', async () => {
    mkdirSync(OUT, { recursive: true });

    const r = render(<RoomScreen />);
    // The profile read, the page, the totals and the marks all resolve on
    // microtasks; without flushing them the plate is a spinner.
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });

    const html = toHtml(r.toJSON());
    writeFileSync(join(OUT, 'r1-a-members-room.html'), html, 'utf8');

    // A plate is worthless if the screen rendered nothing — which is exactly how
    // a signed-out composer once produced an empty tree and a clean pass.
    expect(html.length).toBeGreaterThan(2000);
    for (const word of ['TOMASREYESMENDOZA', 'No. 10248', '128 FILED', '4102 CERTIFIED',
      'THE MEMBER’S FILE', 'MARCH 2025']) {
      expect(`${word}: ${html.includes(word)}`).toMatch(/true$/);
    }
  });
});
