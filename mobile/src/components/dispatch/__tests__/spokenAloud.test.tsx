/**
 * spokenAloud.test.tsx — what the Dispatch hands a screen reader.
 * ─────────────────────────────────────────────────────────────────────────────
 * The ballot card was blank and three thousand tests missed it, because they
 * read the source or asserted a state somebody had already thought of. The
 * thing that found it was RENDERING and reading back what came out.
 *
 * This is the same move pointed at the axis nothing here has ever swept: the
 * accessibility tree. A control with no label is not a cosmetic problem — it is
 * a dead end. VoiceOver reaches it, says "button", and the member has no way to
 * learn what it does.
 *
 * Swept on the SCREENS, not on components in isolation, because a label is only
 * right in the composition it ships in — the feed hands `PaperPost` its
 * handlers, and a control's label can depend on whether it got one.
 *
 * ── FOUR RULES ──────────────────────────────────────────────────────────────
 *   EVERY CONTROL IS NAMED     something touchable with no `accessibilityLabel`
 *                              and no text of its own is unreachable by name.
 *   EVERY CONTROL HAS A ROLE   without one it is announced as plain text, so a
 *                              member never learns it can be operated.
 *   A DISABLED CONTROL SAYS SO `accessibilityState.disabled`, or it is offered
 *                              and then silently does nothing.
 *   NO TWO CONTROLS SHARE A NAME
 *                              "Open this filing" twenty times is navigable;
 *                              two DIFFERENT acts with one name is not. Checked
 *                              per screen, allowing the repeats a list makes.
 */
import React, { act } from 'react';
import { render } from '@testing-library/react-native';

import FeedScreen from '@/app/(tabs)/dispatch';
import { useDispatch } from '@/src/stores/dispatch';
import type { Filing } from '@/src/stores/dispatchTypes';

let mockUser: { id: string; username: string } | null = { id: 'u1', username: 'me' };

jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) =>
      (typeof sel === 'function' ? sel({ user: mockUser }) : { user: mockUser }),
    { getState: () => ({ user: mockUser }), setState: jest.fn(), subscribe: jest.fn() },
  ),
}));
jest.mock('@react-navigation/native', () => ({ useScrollToTop: jest.fn() }));
jest.mock('@/src/utils/typedRouter', () => ({
  nav: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self(); chain.is = () => self(); chain.order = () => self();
      chain.in = () => Promise.resolve({ data: [], error: null });
      chain.limit = () => { const r = Promise.resolve({ data: [], error: null }); return Object.assign(r, { abortSignal: () => r }); };
      chain.insert = () => Promise.resolve({ data: [], error: null });
      chain.update = () => self();
      chain.delete = () => self();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
      return chain;
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: () => [],
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

const filing = (over: Partial<Filing> = {}): Filing => ({
  id: 'f1', kind: 'take', authorId: 'u2',
  author: { name: 'tomasreyes', memberNo: 147, tier: 'free' },
  film: null, subjectId: null, subjectKind: null,
  title: null, body: 'A take about a film.', fullContent: null,
  source: null, sourceUrl: null,
  options: null, closesAt: null, frozenTotals: null, answerId: null,
  seriesId: null, seriesTitle: null, partNumber: null,
  spoilerLabel: null, withheldAt: null, endedAt: null, endedBy: null,
  certifyCount: 3, commentCount: 1,
  createdAt: at(2026, 8, 28, 21), editedAt: null,
  ...over,
});

const put = (over: Record<string, unknown>) => {
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
  const r = render(<FeedScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
};

// ── walking the tree ────────────────────────────────────────────────────────

interface Control {
  role?: string;
  label?: string;
  state?: Record<string, unknown>;
  pressable: boolean;
  text: string;
}

/** Every string under a node, joined — a control's own name when it has no label. */
const textUnder = (node: any, out: string[] = []): string[] => {
  if (node == null) return out;
  if (typeof node === 'string') { if (node.trim()) out.push(node.trim()); return out; }
  if (Array.isArray(node)) { for (const n of node) textUnder(n, out); return out; }
  textUnder(node.children, out);
  return out;
};

/**
 * Anything a member can operate.
 *
 * `onStartShouldSetResponder` is what a rendered RN pressable actually carries
 * in the test tree — `onPress` is consumed by the Pressability layer and is not
 * on the host node, so looking for `onPress` here finds nothing at all and the
 * sweep passes while seeing zero controls. That is why the count is asserted.
 */
const controlsIn = (node: any, out: Control[] = []): Control[] => {
  if (node == null || typeof node === 'string') return out;
  if (Array.isArray(node)) { for (const n of node) controlsIn(n, out); return out; }
  const p = node.props ?? {};
  const pressable = typeof p.onStartShouldSetResponder === 'function'
    || typeof p.onClick === 'function'
    || typeof p.onPress === 'function';
  if (pressable || p.accessibilityRole || p.accessible === true) {
    out.push({
      role: p.accessibilityRole,
      label: p.accessibilityLabel,
      state: p.accessibilityState,
      pressable,
      text: textUnder(node).join(' '),
    });
  }
  controlsIn(node.children, out);
  return out;
};

/** Only the things a member can actually operate. */
const operable = (cs: Control[]) => cs.filter(
  (c) => c.pressable || ['button', 'link', 'radio', 'checkbox', 'switch', 'tab'].includes(c.role ?? ''),
);

/**
 * Every string a screen reader would actually utter — the tree minus whatever
 * sits under something hidden from the accessibility layer.
 *
 * Hiding is INHERITED: `no-hide-descendants` and `accessibilityElementsHidden`
 * take the whole subtree with them, so the flag has to travel down the walk
 * rather than being read off each node.
 */
const spokenStrings = (node: any, off = false, out: string[] = []): string[] => {
  if (node == null || typeof node === 'string') return out;
  if (Array.isArray(node)) { for (const n of node) spokenStrings(n, off, out); return out; }
  const p = node.props ?? {};
  const hidden = off
    || p.accessibilityElementsHidden === true
    || p.importantForAccessibility === 'no-hide-descendants'
    || p.accessible === false;
  const own = (node.children ?? []).filter((c: any) => typeof c === 'string').join('').trim();
  if (own && !hidden) out.push(own);
  spokenStrings(node.children, hidden, out);
  return out;
};

const SCENES: { name: string; state: Record<string, unknown>; signedOut?: boolean }[] = [
  { name: 'a full page', state: { filings: [filing(), filing({ id: 'f2', kind: 'ballot', body: 'Which Ozu?' })] } },
  { name: 'one filing, signed out', state: { filings: [filing()] }, signedOut: true },
  { name: 'loading', state: { loading: true } },
  { name: 'empty', state: { filings: [] } },
  { name: 'a veiled filing', state: { filings: [filing({ spoilerLabel: 'SPOILERS' })] } },
  { name: 'a struck filing', state: { filings: [filing({ endedBy: 'house', body: '' })] } },
  { name: 'filings held back', state: { filings: [filing()], newCount: 3 } },
  { name: 'only what was kept', state: { filings: [filing()], savedOnly: true } },
  { name: 'ordered by certifications', state: { filings: [filing()], sort: 'CERTIFIED' } },
];

describe('the Dispatch, read aloud', () => {
  for (const scene of SCENES) {
    describe(scene.name, () => {
      let controls: Control[] = [];
      let sceneTree: unknown = null;

      beforeEach(async () => {
        mockUser = scene.signedOut ? null : { id: 'u1', username: 'me' };
        put(scene.state);
        const { toJSON } = await mount();
        sceneTree = toJSON();
        controls = operable(controlsIn(sceneTree));
      });

      it('has controls at all — or this proves nothing', () => {
        // The sweep's own negative control. An earlier draft looked for
        // `onPress`, which a host node never carries, found zero controls, and
        // would have reported a clean bill of health on every screen forever.
        expect(controls.length).toBeGreaterThan(0);
      });

      it('names every one of them', () => {
        const nameless = controls
          .filter((c) => !(c.label ?? '').trim() && !c.text.trim())
          .map((c) => c.role ?? '(no role)');
        expect(nameless).toEqual([]);
      });

      it('gives every one of them a role', () => {
        const roleless = controls
          .filter((c) => !c.role)
          .map((c) => c.label || c.text || '(unnamed)');
        expect(roleless).toEqual([]);
      });

      it('says so when one is disabled rather than ignoring the tap', () => {
        // A control whose handler is absent must ANNOUNCE that it is disabled.
        // Signed out, the marks are exactly this case, and the app already has a
        // test that they are not inert — this is the same rule, spoken.
        const silent = controls
          .filter((c) => !c.pressable && c.role === 'button')
          .filter((c) => (c.state as { disabled?: boolean } | undefined)?.disabled !== true)
          .map((c) => c.label || c.text);
        expect(silent).toEqual([]);
      });

      it('reads out no ornament, separator or rule', () => {
        /**
         * ── THE ONE THAT ACTUALLY FOUND SOMETHING ────────────────────────────
         * Read aloud, the index was:
         *
         *   "ALL, middle dot, TAKES, middle dot, SEEKING, middle dot, WIRE…"
         *
         * — five interruptions between six departments, in the control that
         * decides what the whole page is. And every card opened "147.
         * TOMASREYES · No. 147", the member's number spoken twice, the first
         * time meaning nothing on its own.
         *
         * `decorativeTextProps` was on both and does NOT do this: it sets
         * `allowFontScaling: false` and nothing else. Its name promises the ear
         * and delivers only the eye. `UNSPOKEN` is the one that hides a mark,
         * and it needs BOTH properties — `accessibilityElementsHidden` is iOS,
         * `importantForAccessibility` is Android, either alone leaves the mark
         * spoken on the other platform.
         *
         * Judged on the RENDER, not the source. A source sweep for the same
         * thing returned fifteen findings of which thirteen were artefacts of
         * stripping interpolations out of JSX — it called the drawn caret
         * unspoken when it carries UNSPOKEN, and called `{pct[i]}%` and
         * `{kind.toUpperCase()} — ` ornaments. What reaches the ear is a
         * property of the tree.
         */
        const spoken = spokenStrings(sceneTree);
        const ornamental = spoken.filter((s) => !/[A-Za-z0-9؀-ۿ]/.test(s));
        expect(ornamental).toEqual([]);
      });

      it('never says the same thing twice in a row', () => {
        /**
         * The avatar's member number is DIGITS, so the ornament rule above
         * cannot see it — and every card opened "147. TOMASREYES · No. 147",
         * the number spoken, then spoken again inside the byline a moment
         * later. The first utterance means nothing on its own: it is a
         * stand-in for a face, not a fact being announced.
         *
         * So the rule is about the SEQUENCE, not the character: a run that its
         * own neighbour repeats whole is noise, whatever it is made of. Adjacent
         * only — "CERTIFY" appearing under every card is a list, not a stammer.
         */
        const spoken = spokenStrings(sceneTree);
        const echoed: string[] = [];
        for (let i = 0; i + 1 < spoken.length; i++) {
          const a = spoken[i]; const b = spoken[i + 1];
          if (a.length >= 2 && a !== b && b.includes(a)) echoed.push(`"${a}" then "${b}"`);
        }
        expect(echoed).toEqual([]);
      });
    });
  }
});
