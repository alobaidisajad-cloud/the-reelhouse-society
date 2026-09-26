/**
 * theCountHangsBesideItsMark — every bar carries its counts the same way.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house has four bars that certify and critique: the Reel's card (also the
 * film archive's), the log page, a filing on the Dispatch, and the reader's
 * docked bar — plus the tombstone's single CRITIQUE and the stack page's bar,
 * which has its own test beside its screen. Each drew its numbers its own way,
 * or not at all: `12 CRITIQUES` glued to a word, a count in the byline, a count
 * only in the spoken label, a count beside the icon that pushed it off centre.
 *
 * Now there is one anatomy (MarkFigure): the icon centred over its word, the
 * number hanging to the icon's right, the word alone underneath. These render
 * each bar for real and ask the same questions of all of them.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const { create } = jest.requireActual('zustand');
  return { useAuthStore: create(() => ({ user: null })) };
});
const mockFilms = {
  _endorsedIndex: {} as Record<string, unknown>, _watchlistIndex: {},
  toggleEndorse: jest.fn(), addToWatchlist: jest.fn(), removeFromWatchlist: jest.fn(),
};
jest.mock('@/src/stores/films', () => ({
  useWatchlistStore: (sel: (s: unknown) => unknown) => sel(mockFilms),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/src/utils/gateTelemetry', () => ({ recordGateEvent: jest.fn() }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { selection: jest.fn(), mutate: jest.fn(), navigate: jest.fn(), destroy: jest.fn() },
}));
jest.mock('@/src/components/ShareToLoungeModal', () => ({ __esModule: true, default: () => null }));

// eslint-disable-next-line import/first
import { ActionDeck } from '@/src/components/feed/ActionDeck';
// eslint-disable-next-line import/first
import LogActionDeck from '@/src/components/log/LogActionDeck';
// eslint-disable-next-line import/first
import { PaperActions, PaperPost } from '@/src/components/dispatch/paper/PaperPost';
// eslint-disable-next-line import/first
import { PostDock, CritiqueRow } from '@/src/components/dispatch/paper/PaperCritiques';
// eslint-disable-next-line import/first
import LogComments from '@/src/components/log/LogComments';
// eslint-disable-next-line import/first
import { StackCard } from '@/src/components/reels/ReelsCards';
// eslint-disable-next-line import/first
import { resetMarkCounts } from '@/src/stores/markCounts';

type Bar = (certify: number | null, critique: number | null, on: boolean) => React.ReactElement;

const noop = () => {};
const BARS: Record<string, Bar> = {
  'the Reel card': (c, k, on) => {
    mockFilms._endorsedIndex = on ? { 'log-1': { type: 'endorse' } } : {};
    return <ActionDeck itemId="log-1" filmId={603} filmTitle="The Matrix" posterPath={null} ownerUsername="someone-else" certifyCount={c} critiqueCount={k} />;
  },
  'the log page': (c, k, on) => (
    <LogActionDeck logId="log-1" log={{ film_id: 603, film_title: 'The Matrix', poster_path: null }}
      isOwner={false} endorsed={on} certifyCount={c} critiqueCount={k} filmSaved={false} autopsyOpen={false}
      onToggleEndorse={noop} onToggleAutopsy={noop} onCritiquePress={noop} onSavePress={noop} onEditPress={noop} onLoungePress={noop} />
  ),
  'a filing': (c, k, on) => (
    <PaperActions certifyCount={c ?? 0} commentCount={k ?? 0} certified={on} onCertify={noop} onCritique={noop} onShare={noop} onSave={noop} />
  ),
  'the reader’s dock': (c, k, on) => (
    <PostDock certifyCount={c ?? 0} commentCount={k ?? 0} certified={on} onCertify={noop} onCritique={noop} onShare={noop} onSave={noop} />
  ),
};

/** Every string a Text draws, in order. */
const texts = (r: ReturnType<typeof render>) => {
  const out: string[] = [];
  const walk = (n: any) => {
    if (!n || typeof n === 'string') return;
    if (n.type === 'Text') out.push([n.children].flat(3).filter((x: unknown) => typeof x === 'string').join(''));
    (n.children ?? []).forEach(walk);
  };
  walk(r.toJSON());
  return out;
};

/** The count is hidden from the accessibility tree on purpose; find it anyway. */
const HIDDEN_TOO = { includeHiddenElements: true } as const;

/** A count's box, in either reach (`mark-count`, `mark-count-open`). */
const COUNT_BOX = /^mark-count(-open)?$/;

/** The count's own box, found from its text. */
const hangOf = (r: ReturnType<typeof render>, figure: string) => {
  let n: any = r.getByText(figure, HIDDEN_TOO).parent;
  while (n && !COUNT_BOX.test(n.props?.testID ?? '')) n = n.parent;
  return n;
};

beforeEach(() => { resetMarkCounts(); mockFilms._endorsedIndex = {}; });

describe.each(Object.entries(BARS))('%s', (_name, bar) => {
  it('hangs each count beside its icon, and leaves the words alone', () => {
    const r = render(bar(2140, 5218, false));
    for (const figure of ['2.1K', '5.2K']) {
      const hang = hangOf(r, figure);
      expect({ figure, hung: !!hang }).toEqual({ figure, hung: true });
      // Laid over the icon's line, never in the flow: the bar is the same
      // height with a count or without one.
      expect(StyleSheet.flatten(hang.props.style).position).toBe('absolute');
      // …and the icon is the figure's other child, so the count sits beside it.
      expect(hang.parent.children.length).toBe(2);
    }
    const t = texts(r);
    expect(t).toEqual(expect.arrayContaining(['CERTIFY', 'CRITIQUE']));
    // No word carries a number any more, and no number is printed twice.
    expect(t.filter((s) => /\d/.test(s))).toEqual(['2.1K', '5.2K']);
  });

  it('draws no number for none — nor for a count nobody could give', () => {
    for (const [c, k] of [[0, 0], [null, null]] as const) {
      const r = render(bar(c, k, false));
      expect(r.queryAllByTestId(COUNT_BOX, HIDDEN_TOO)).toHaveLength(0);
      expect(texts(r).filter((s) => /\d/.test(s))).toEqual([]);
      r.unmount();
    }
  });

  it('keeps the number out of the reader’s way, and puts it in the button’s words', () => {
    const r = render(bar(12, 3, false));
    for (const figure of ['12', '3']) {
      const hang = hangOf(r, figure);
      expect(hang.props.accessibilityElementsHidden).toBe(true);
      expect(hang.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    expect(r.getByLabelText(/12 members have certified this/)).toBeTruthy();
    expect(r.getByLabelText(/3 critiques$/)).toBeTruthy();
  });

  it('says one of each in the singular', () => {
    const r = render(bar(1, 1, false));
    expect(r.getByLabelText(/1 member has certified this/)).toBeTruthy();
    expect(r.getByLabelText(/1 critique$/)).toBeTruthy();
  });

  it('a certified count is in the certified ink, the same as its word', () => {
    const r = render(bar(12, 3, true));
    const ink = (s: string) => StyleSheet.flatten(r.getByText(s, HIDDEN_TOO).props.style).color;
    expect(ink('12')).toBe(ink('CERTIFIED'));
    // …and the critique count stays in the plain ink of ITS word.
    expect(ink('3')).toBe(ink('CRITIQUE'));
    expect(ink('12')).not.toBe(ink('3'));
  });

  it('never grows past the words it sits over, and never shrinks under the floor', () => {
    const r = render(bar(9900, 3, false));
    const p = r.getByText('9.9K', HIDDEN_TOO).props;
    expect(p.maxFontSizeMultiplier).toBe(1.2);
    expect(p.numberOfLines).toBe(1);
    expect(p.adjustsFontSizeToFit).toBe(true);
    // Shrink gives back only what the text size added: 10pt × 1.2 × (1/1.2).
    expect(p.maxFontSizeMultiplier * p.minimumFontScale).toBeCloseTo(1, 5);
  });
});

describe('how far a count may reach', () => {
  // A bar drawn on seams keeps each number inside its own column; a bar set on
  // the bare page lets it run on toward the next icon (MarkFigure, `reach`).
  it.each([
    ['the Reel card', 'mark-count'],
    ['the log page', 'mark-count'],
    ['a filing', 'mark-count-open'],
    ['the reader’s dock', 'mark-count-open'],
  ])('%s → %s', (name, testID) => {
    const r = render(BARS[name](12, 3, false));
    const boxes = r.queryAllByTestId(testID, HIDDEN_TOO);
    expect(boxes).toHaveLength(2);
    // And the box's edge is where that reach says: its own column's edge less
    // the inset, or half a column on less half an icon and the gap.
    for (const b of boxes) {
      const st = StyleSheet.flatten(b.props.style);
      if (testID === 'mark-count-open') {
        expect(st.right).toBe('-50%');
        expect(st.marginRight).toBeGreaterThanOrEqual(7.5 + 2);
      } else {
        expect(st.right).toBe(0);
        expect(st.marginRight).toBe(0.5);
      }
    }
  });
});

describe('the tombstone keeps its one control', () => {
  const tomb = (n: number) => (
    <PaperPost kind="take" author={null} body="" order="—" measureWidth={300} ended="author" commentCount={n} onCritique={noop} />
  );

  it('carries its count beside the icon, and says CRITIQUE', () => {
    const r = render(tomb(12));
    expect(hangOf(r, '12')).toBeTruthy();
    expect(texts(r)).toContain('CRITIQUE');
    expect(texts(r).some((s) => /CRITIQUES/.test(s))).toBe(false);
    expect(r.getByLabelText('Critique. 12 critiques remain under this filing')).toBeTruthy();
  });

  it('with nothing left under it, says so without a zero', () => {
    const r = render(tomb(0));
    expect(r.queryAllByTestId(COUNT_BOX, HIDDEN_TOO)).toHaveLength(0);
    expect(r.getByLabelText('Critique')).toBeTruthy();
  });
});

describe('a filing’s byline no longer carries a count', () => {
  it('the number is on the bar, once', () => {
    const r = render(
      <PaperPost kind="take" author={{ name: 'Ana', no: 17, rank: 'cinephile' } as never} body="Two hours twenty."
        order="3" measureWidth={300} certifyCount={4} commentCount={31} onCritique={noop} onCertify={noop} onShare={noop} onSave={noop} />,
    );
    expect(texts(r).filter((s) => /31/.test(s))).toEqual(['31']);
    expect(texts(r).some((s) => /CRITIQUES/.test(s))).toBe(false);
  });
});

describe('a zero is never printed — anywhere a mark is counted', () => {
  /** Every string drawn, the hidden ones included: a hidden "0" is still a 0 on screen. */
  const drawn = (r: ReturnType<typeof render>) => r.queryAllByText(/./, HIDDEN_TOO).map((t: any) =>
    [t.props.children].flat(3).filter((x: unknown) => typeof x === 'string' || typeof x === 'number').join(''));
  const noZero = (r: ReturnType<typeof render>) =>
    expect(drawn(r).filter((s) => /(^|[^\d.])0(?![\d.])/.test(s))).toEqual([]);

  it('a critique with no certifications has a heart and no number', () => {
    const r = render(<CritiqueRow c={{ id: 'c1', author: null, body: 'Cold is not unfeeling.', certifyCount: 0, age: '1 HR' } as never} onCertify={noop} />);
    noZero(r);
    // Not even an empty text beside the heart: nothing, so nothing holds a slot.
    const control: any = r.getByLabelText('Certify this critique');
    const textsIn = (n: any): number => (n && typeof n === 'object'
      ? (n.type === 'Text' ? 1 : 0) + (n.children ?? []).reduce((a: number, c: any) => a + textsIn(c), 0)
      : 0);
    expect(textsIn(control)).toBe(0);
  });

  it('…and one with certifications says so, once', () => {
    const r = render(<CritiqueRow c={{ id: 'c1', author: null, body: 'Cold is not unfeeling.', certifyCount: 1200, age: '1 HR' } as never} onCertify={noop} />);
    expect(r.getByText('1.2K', HIDDEN_TOO)).toBeTruthy();
    expect(r.getByLabelText('Certify this critique. 1200 members have certified this critique')).toBeTruthy();
  });

  it('the log page’s critique header says CRITIQUES, not CRITIQUES (0)', () => {
    const props = {
      comments: [], newComment: '', posting: false, critiqueInputRef: { current: null } as never,
      onNewCommentChange: noop, onPostComment: noop, onDeleteComment: noop, onPressUser: noop,
    };
    const none = render(<LogComments {...props} commentTotal={0} />);
    noZero(none);
    expect(drawn(none).some((s) => s.includes('CRITIQUES'))).toBe(true);
    none.unmount();
    const many = render(<LogComments {...props} commentTotal={1200} />);
    expect(drawn(many).some((s) => s.includes('CRITIQUES (1.2K)'))).toBe(true);
  });

  it('a stack card with no certifications draws no count', () => {
    const stack = { id: 'abcd', title: 'Rain', description: '', curator: 'ana', curatorId: 'u', createdAt: '2026-01-01', films: [], count: 3, certifyCount: 0, isRanked: false };
    noZero(render(<StackCard stack={stack as never} onPress={noop} />));
  });

  it.each(Object.entries(BARS))('%s — none, drawn as nothing', (_n, bar) => {
    noZero(render(bar(0, 0, false)));
  });
});

describe('the class is closed', () => {
  /**
   * Every bar that offers CERTIFY is enumerated from the source, not from a
   * list kept here: a new bar that draws the word without the figure fails
   * this the day it is written.
   */
  const ROOT = join(__dirname, '..', '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'src'));

  const bars = files
    .map((f) => ({ f: relative(ROOT, f).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }))
    .filter(({ src }) => /'CERTIFIED'\s*:\s*'CERTIFY'/.test(src));

  it('finds every bar that certifies', () => {
    expect(bars.map((b) => b.f).sort()).toEqual([
      'app/stacks/[id].tsx',
      'src/components/dispatch/paper/PaperCritiques.tsx',
      'src/components/dispatch/paper/PaperPost.tsx',
      'src/components/feed/ActionDeck.tsx',
      'src/components/log/LogActionDeck.tsx',
    ]);
  });

  it.each([0, 1, 2, 3, 4])('bar %i draws its counts with the one figure', (i) => {
    const { f, src } = bars[i];
    // One figure for certify and one for critique, in every bar.
    expect({ f, figures: (src.match(/<MarkFigure iconSize=/g) ?? []).length >= 2 }).toEqual({ f, figures: true });
    // And no label anywhere in it glues a count to a word — `${certifyCount}
    // CERTIFIED`, or the stack bar's `${critiqueCount} ` set before one.
    expect({ f, glued: /\$\{\w*[cC]ount\}\s+(CERTIF|CRITIQUE)|\$\{\w*[cC]ount\} `/.test(src) }).toEqual({ f, glued: false });
  });
});
