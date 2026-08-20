/**
 * stack-detail.redesign.test.tsx — the catalogue, mounted.
 *
 * The defects this pass fixed were all invisible to a type check and most were
 * invisible to reading: chrome with no ground, two left margins on one page, a
 * hero that vanished when one poster was missing, a fold offered by character
 * count while the clamp counts lines, a timestamp in the border colour.
 *
 * These drive the screen. Where a fact is pure geometry — the three numbers
 * that make the single column — it is read from the source instead, because
 * layout arithmetic has no rendered symptom until it is wrong on a device.
 */
import React, { act } from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import StackDetailScreen from '../[id]';

const STACK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE = readFileSync(join(__dirname, '..', '[id].tsx'), 'utf8');

/** Swapped per test, then read by the mocked useQuery below. */
let mockStackData: Record<string, unknown>;
const baseStack = {
  id: STACK_ID, title: 'Noir', description: '', userId: 'u1', user: 'morpho',
  createdAt: '2026-06-01T00:00:00Z', films: [], filmCount: 0,
  isPrivate: false, isRanked: false, critiqueCount: 0,
};

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
  useLocalSearchParams: () => ({ id: STACK_ID }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
const mockSetQueryData = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
  useQueryClient: () => ({
    setQueryData: mockSetQueryData, getQueryData: jest.fn(), removeQueries: jest.fn(),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()),
  }),
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = String(opts.queryKey[0]);
    if (key === 'stackComments') return { data: [] };
    if (key === 'stack') return { data: mockStackData, isLoading: false, isError: false };
    return { data: undefined, isLoading: false, isError: false };
  },
}));
jest.mock('@/src/stores/films', () => {
  const state = { logs: [], lists: [], _listEndorsedIndex: {}, toggleListEndorse: jest.fn(), deleteList: jest.fn() };
  const useListStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useListStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useListStore };
});
jest.mock('@/src/stores/blockStore', () => {
  const state = { blockUser: jest.fn(), muteUser: jest.fn(), isBlocked: () => false, isMuted: () => false };
  const useBlockStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useBlockStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useBlockStore };
});
jest.mock('@/src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'u1', username: 'morpho' } }) }));
const mockAddComment = jest.fn();
jest.mock('@/src/services/StackService', () => ({
  StackService: {
    getStackFullPayload: jest.fn(), getStackComments: jest.fn(),
    addStackComment: (...a: unknown[]) => mockAddComment(...a),
  },
}));
const mockEnqueue = jest.fn();
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: (...a: unknown[]) => mockEnqueue(...a),
  flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
const mockBackHandlers: (() => boolean)[] = [];
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { poster: (p: string, size: string) => `https://img/${size}${p}` } }));
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const React = require('react');
  const { View } = require('react-native');
  const render = (c: React.ReactNode) => (typeof c === 'function' ? React.createElement(c as never) : c);
  return { CinematicFlashList: ({ ListHeaderComponent, ListEmptyComponent, data, renderItem }: {
    ListHeaderComponent?: React.ReactNode; ListEmptyComponent?: React.ReactNode;
    data?: unknown[]; renderItem?: (a: { item: unknown; index: number }) => React.ReactNode;
  }) => React.createElement(View, null,
    render(ListHeaderComponent),
    // renderItem was never called, so every claim about the index was a
    // source-read: the caption box, the rank leaving the artwork, the rows
    // sharing a baseline. None of it had ever rendered.
    ...(data ?? []).map((item, index) =>
      React.createElement(React.Fragment, { key: index }, renderItem ? renderItem({ item, index }) : null)),
    (data ?? []).length === 0 ? render(ListEmptyComponent) : null) };
});
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
jest.mock('expo-blur', () => {
  const React = require('react');
  return { BlurView: (props: Record<string, unknown>) => React.createElement('BlurView', props) };
});
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  return { LinearGradient: (props: Record<string, unknown>) => React.createElement('Gradient', props) };
});

const mount = (over: Record<string, unknown> = {}) => {
  mockStackData = { list: { ...baseStack, ...over }, endorseCount: 0 };
  return render(<StackDetailScreen />);
};

type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };
function walk(r: ReturnType<typeof mount>): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    out.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(r.toJSON());
  return out;
}

/** Every string inside a rendered node, joined — safe where React children are not. */
function flatText(n: Node): string {
  return (n.children ?? []).map(c => (typeof c === 'string' ? c : flatText(c))).join('');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBackHandlers.length = 0;
  jest.spyOn(require('react-native').BackHandler, 'addEventListener')
    .mockImplementation(((_e: string, h: () => boolean) => {
      mockBackHandlers.push(h);
      return { remove: jest.fn() };
    }) as never);
});

describe('the chrome has a ground', () => {
  it('the scrim is a gradient, not only a blur', async () => {
    // A blur cannot separate near-black content from near-black chrome, and
    // expo-blur is weak on Android besides. The gradient is the mechanism.
    const r = mount();
    await waitFor(() => expect(walk(r).some(n => n.type === 'Gradient')).toBe(true));
  });

  it('no platform-specific effect is the only mechanism', () => {
    // The blur is reached for ONLY behind a Platform check; the gradient is not.
    expect(SOURCE).toMatch(/Platform\.OS === 'ios' && blurStyle/);
    const scrim = SOURCE.slice(SOURCE.indexOf('navScrim, { height'), SOURCE.indexOf('</View>', SOURCE.indexOf('navScrim, { height')));
    expect(scrim).toMatch(/LinearGradient/);
  });

  it('one nav component, not three copies', () => {
    // The loading one carried no safe-area padding at all, so the way back sat
    // under the notch while the stack fetched. Three call sites, one component.
    expect(SOURCE.match(/<StackNav /g) ?? []).toHaveLength(3);
    expect(SOURCE.match(/s\.navBar/g) ?? []).toHaveLength(1);
  });
});

describe('one column', () => {
  it('the three numbers that make the margin still agree', () => {
    // 9 (page) + 7 (cell) = a 16pt margin, and 7 + 7 = a 14pt gutter. The hero
    // wrap adds the same 7 so the title begins exactly where the posters do.
    // It was 12 + 16 = 28 for the title against 12 + 4 = 16 for the grid.
    const num = (style: string, prop: string) => {
      const body = SOURCE.slice(SOURCE.indexOf(`${style}: {`));
      return Number(body.slice(0, body.indexOf('}')).match(new RegExp(`${prop}: (\\d+)`))![1]);
    };
    const page = num('scrollContent', 'paddingHorizontal');
    const wrap = num('headerContentWrap', 'paddingHorizontal');
    const cell = num('filmItem', 'marginHorizontal');
    expect(page + cell).toBe(16);
    expect(page + wrap).toBe(page + cell);          // title and posters, one edge
    expect(SOURCE).toMatch(/const ITEM_WIDTH = \(windowWidth - 18 - 42\) \/ 3;/);
  });
});

describe('the hero', () => {
  it('survives a first film with no artwork', async () => {
    // It read films[0].poster_path only, so a stack whose opening entry had no
    // poster lost its hero entirely while ten others sat there with one.
    const r = mount({
      films: [
        { id: 1, title: 'No art', poster_path: null },
        { id: 2, title: 'Has art', poster_path: '/second.jpg' },
      ],
      filmCount: 2,
    });
    await waitFor(() => {
      const sources = walk(r)
        .map(n => (typeof n.props?.source === 'string' ? n.props.source : n.props?.source?.uri))
        .filter(Boolean) as string[];
      expect(sources.some(u => u.includes('/second.jpg'))).toBe(true);
      expect(sources.some(u => u.includes('w780'))).toBe(true);   // and it is the hero
    });
  });

  it('is measured from the safe area, not from the phone', () => {
    // windowHeight * 0.45 put the title 120pt lower on a tall phone than a
    // short one — the page's first impression changed with the hardware.
    expect(SOURCE).toMatch(/HEADER_HEIGHT = insets\.top \+ Math\.min\(320, Math\.max\(236/);
    expect(SOURCE).not.toMatch(/HEADER_HEIGHT = windowHeight \* 0\.45/);
  });

  it('sets a long title smaller rather than cutting it', () => {
    // 100 characters are allowed (MAX_LENGTHS.listTitle) and Rye at 36pt held
    // about 42. The steps are computed from the measured width, so a 360dp
    // screen is not held to a number derived on a 393.
    expect(SOURCE).toMatch(/capacity\(36, 3\)/);
    expect(SOURCE).toMatch(/capacity\(30, 4\)/);
    expect(SOURCE).toMatch(/fontSize: 24, lineHeight: 28, numberOfLines: 6/);
    // and never shrink-to-fit, which disagrees across platforms
    expect(SOURCE.slice(SOURCE.indexOf('style={[s.title'), SOURCE.indexOf('</Animated.Text>')))
      .not.toMatch(/adjustsFontSizeToFit/);
  });

  it('does not title itself above its own title', async () => {
    const r = mount();
    await waitFor(() => expect(r.queryByText(/FROM THE STACKS/)).toBeNull());
  });
});

describe('the colophon', () => {
  it('is one run of text, so a separator can never begin a line', async () => {
    // Each fragment used to be its own <Text> in a wrapping row, so
    // "· EST. MARCH 2026" could fall to the next line carrying its dot.
    const r = mount({ user: 'morpho', filmCount: 11 });
    await waitFor(() => expect(r.getByText(/11 REELS/)).toBeTruthy());
    const runs = walk(r).filter(n => flatText(n).includes('11 REELS'));
    const colophon = runs[runs.length - 1];            // the innermost Text holding it
    const text = flatText(colophon);
    expect(text).toContain('MORPHO');
    expect(text).toContain('EST.');
    // and the separator never leads: it is always preceded by a word
    expect(text).not.toMatch(/^s*·/);
  });
});

describe('the index', () => {
  it('reserves a caption box so the rows share a baseline', () => {
    // numberOfLines={2} with no reserved height let a one-line title make a
    // short cell and a two-line title a tall one, and the grid rippled.
    const cap = SOURCE.slice(SOURCE.indexOf('filmTitle: {'));
    expect(cap.slice(0, cap.indexOf('}'))).toMatch(/minHeight: 28/);
  });

  it('keeps the rank off the artwork', () => {
    // A 28pt numeral under a gradient covered the bottom of every poster.
    expect(SOURCE).not.toMatch(/rankBadgeWrap/);
    expect(SOURCE).toMatch(/filmCaptionRow/);
  });

  it('states its own bound when a stack outgrows the fetch', async () => {
    // The colophon prints the server's true count while the grid renders at
    // most STACK_ITEMS_LIMIT, so a 620-reel stack would have said 620 and
    // quietly shown 500.
    const films = Array.from({ length: 3 }, (_, i) => ({ id: i, title: `F${i}`, poster_path: `/p${i}.jpg` }));
    const r = mount({ films, filmCount: 620 });
    await waitFor(() => expect(r.getByText(/FIRST 3/)).toBeTruthy());
  });

  it('says nothing about a bound it has not reached', async () => {
    const films = Array.from({ length: 3 }, (_, i) => ({ id: i, title: `F${i}`, poster_path: `/p${i}.jpg` }));
    const r = mount({ films, filmCount: 3 });
    await waitFor(() => expect(r.getByText(/INDEXED REELS/)).toBeTruthy());
    expect(r.queryByText(/FIRST/)).toBeNull();
  });
});

describe('the critiques action', () => {
  it('says what it holds', async () => {
    const r = mount({ critiqueCount: 12 });
    await waitFor(() => expect(r.getByText(/12\s*CRITIQUES/)).toBeTruthy());
  });

  it('says nothing rather than a confident zero when the count failed', async () => {
    // null is "we could not ask", which is not the same statement as "none".
    const r = mount({ critiqueCount: null });
    await waitFor(() => expect(r.getByText(/CRITIQUES/)).toBeTruthy());
    expect(r.queryByText(/0\s*CRITIQUES/)).toBeNull();
  });

  it('is one source of truth, so a refetch cannot double-count', () => {
    // A separate "filed" tally added to the payload's number would double the
    // moment the stack refetched, because the server's count already includes
    // the critique just filed. The cached payload is nudged instead.
    expect(SOURCE).toMatch(/bumpCritiqueCount/);
    expect(SOURCE).not.toMatch(/critiquesFiled/);
    // and it never invents a count where the server gave none
    expect(SOURCE).toMatch(/if \(typeof current !== 'number'\) return old;/);
  });
});

describe('the epigraph folds only when there is more', () => {
  it('is measured, not guessed from a character count', () => {
    // `description.length > 240` against a four-line clamp disagreed both ways:
    // a short description with line breaks was cut with no way to open it, and
    // a long one of short words offered a fold that did nothing.
    expect(SOURCE).toMatch(/descNeedsFold = descLineCount > DESC_CLAMP_LINES/);
    expect(SOURCE).toMatch(/onTextLayout/);
    expect(SOURCE).not.toMatch(/description\?\.length \?\? 0\) > 240/);
  });

  it('clamps and tests against the same number', () => {
    // Two numbers here is how a page comes to offer to open what is not shut.
    expect(SOURCE).toMatch(/numberOfLines=\{descExpanded \? undefined : DESC_CLAMP_LINES\}/);
  });
});

describe('the page is legible and reachable', () => {
  it('a critique timestamp is not the border colour', () => {
    // colors.ash read 1.27:1 against the panel — every critique was undated.
    const t = SOURCE.slice(SOURCE.indexOf('commentTime: {'));
    expect(t.slice(0, t.indexOf('}'))).toMatch(/color: colors\.fog/);
  });

  it('every nav and action control reaches 48 by its own geometry', () => {
    for (const [style, prop] of [
      ['backBtn', 'height'], ['actionBtn', 'height'], ['moreBtn', 'height'], ['actionItem', 'minHeight'],
    ] as const) {
      const body = SOURCE.slice(SOURCE.indexOf(`${style}: {`));
      const value = Number(body.slice(0, body.indexOf('}')).match(new RegExp(`${prop}: (\\d+)`))![1]);
      expect(value).toBeGreaterThanOrEqual(48);
    }
  });

  it('every entrance respects the reader’s motion setting', () => {
    // Eight animations, none of which asked. The import line is the only place
    // FadeIn may appear without it.
    const offenders = SOURCE.split('\n')
      .filter(l => /FadeIn(Down|Up)\./.test(l) && !/reduceMotion\(ReduceMotion\.System\)/.test(l));
    expect(offenders).toEqual([]);
  });
});

describe('the critiques overlay', () => {
  const openIt = async (over: Record<string, unknown> = {}) => {
    const r = mount(over);
    await waitFor(() => expect(r.getByText(/CRITIQUES/)).toBeTruthy());
    const action = r.getByLabelText(/critiques?/i);
    await act(async () => { fireEvent.press(action); });
    return r;
  };

  it('opens over the page instead of pushing the index down', async () => {
    // It used to render BETWEEN the description and the index, so the films a
    // reader came for were displaced by talk about them — and at 500 reels that
    // panel sat on top of 167 rows of posters.
    const r = await openIt();
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    // The index is still mounted and still above it in the page.
    expect(r.getByText(/INDEXED REELS/)).toBeTruthy();
    expect(SOURCE).not.toMatch(/showComments && \(\s*<Animated\.View[\s\S]{0,80}commentsPanel/);
  });

  it('is NOT a Modal, so the moderation sheet cannot stack on it', () => {
    // A critique is long-pressed to report or block, and ContentActionSheet is
    // a real RN Modal. Modal-over-Modal is the iOS trap behind this app's
    // park-then-travel law, so the critiques surface must not be one.
    const overlay = SOURCE.slice(SOURCE.indexOf('══ THE CRITIQUES'), SOURCE.indexOf('SHARE TO LOUNGE MODAL'));
    expect(overlay).toMatch(/StyleSheet\.absoluteFill/);
    expect(overlay).not.toMatch(/<Modal/);
  });

  it('an overlay gets no back button for free, so it takes one by hand', () => {
    expect(SOURCE).toMatch(/BackHandler\.addEventListener\('hardwareBackPress'/);
    // Consumed, or Android would leave the page as well as the sheet.
    const h = SOURCE.slice(SOURCE.indexOf("hardwareBackPress"));
    expect(h.slice(0, 220)).toMatch(/return true;/);
  });

  it('the strip of page left showing is a way out', async () => {
    const r = await openIt();
    // TWO of them, which is the point: the ✕ and the strip of page above the
    // sheet. Reaching for the thing behind is how most people close a surface
    // like this, and it did nothing before.
    await waitFor(() => expect(r.getAllByLabelText('Close critiques').length).toBeGreaterThanOrEqual(2));
  });

  it('says what it holds, in the sheet as well as on the button', async () => {
    const r = await openIt({ critiqueCount: 12 });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    expect(r.getAllByText('12').length).toBeGreaterThan(0);
  });

  it('invites the first critique rather than showing an empty box', async () => {
    const r = await openIt();
    await waitFor(() => expect(r.getByText(/Be the first to speak/)).toBeTruthy());
  });

  it('focuses the field on the way in and not on the way out', () => {
    // It focused on close too, which summoned the keyboard for a surface that
    // was going away.
    const t = SOURCE.slice(SOURCE.indexOf('const handleToggleComments'));
    expect(t.slice(0, 400)).toMatch(/if \(!prev\) setTimeout/);
  });

  it('every control in it reaches 48 by geometry', () => {
    for (const [style, prop] of [['critiqueClose', 'height'], ['critiqueField', 'minHeight'], ['critiqueSend', 'minHeight']] as const) {
      const body = SOURCE.slice(SOURCE.indexOf(`${style}: {`));
      const value = Number(body.slice(0, body.indexOf('}')).match(new RegExp(`${prop}: (\\d+)`))![1]);
      expect(value).toBeGreaterThanOrEqual(48);
    }
  });

  it('leaves no style behind from the panel it replaced', () => {
    // Matched as a DECLARATION, not a substring: `placeholderText` is also the
    // opening of `placeholderTextColor`, a live prop on the critique input, so
    // a bare contains() reported a style that had been removed as still there.
    for (const gone of ['commentsPanel', 'commentInputRow', 'commentInput', 'commentSendBtn', 'placeholderText']) {
      expect(SOURCE).not.toContain(`\n  ${gone}: {`);
    }
  });
});

describe('the states a real stack arrives in', () => {
  const LONG_TITLE = 'A'.repeat(100);          // MAX_LENGTHS.listTitle

  it('an empty stack says so instead of showing a bare grid', async () => {
    const r = mount({ films: [], filmCount: 0 });
    await waitFor(() => expect(r.getByText('An Empty Stack')).toBeTruthy());
  });

  it('a single reel is a REEL, not REELS', async () => {
    const r = mount({ films: [{ id: 1, title: 'One', poster_path: '/a.jpg' }], filmCount: 1 });
    await waitFor(() => expect(r.getByText(/1 REEL(?!S)/)).toBeTruthy());
  });

  it('no description means no fold offered', async () => {
    const r = mount({ description: '' });
    await waitFor(() => expect(r.getByText(/INDEXED REELS/)).toBeTruthy());
    expect(r.queryByText(/READ MORE/)).toBeNull();
  });

  /** The rendered size and line allowance of the hero title. */
  const titleSetting = async (title: string) => {
    const r = mount({ title });
    await waitFor(() => expect(r.getByText(title.toUpperCase())).toBeTruthy());
    const node = r.getByText(title.toUpperCase());
    const flat = Object.assign({}, ...[node.props.style].flat(2).filter(Boolean));
    return { fontSize: flat.fontSize as number, lines: node.props.numberOfLines as number };
  };

  it('a long title is set smaller, and given more room, rather than cut', async () => {
    // Asserted as a RELATION, not as a number: the steps are computed from the
    // measured width, so the exact size depends on the screen — which is the
    // whole point of computing it. An earlier version of this test hard-coded
    // 24pt and failed on a wider viewport while the code was behaving.
    const short = await titleSetting('Noir');
    const long = await titleSetting(LONG_TITLE);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.lines).toBeGreaterThan(short.lines);
  });

  it('a short title keeps the full display size', async () => {
    expect((await titleSetting('Noir')).fontSize).toBe(36);
  });

  it('a very long curator handle cannot push the date onto a line of its own', async () => {
    // The whole colophon is one run of text, so it wraps as prose no matter
    // how long the handle is — there is no fragment left to strand.
    const r = mount({ user: 'a'.repeat(40), filmCount: 3 });
    await waitFor(() => expect(r.getByText(/3 REELS/)).toBeTruthy());
    const runs = walk(r).filter(n => flatText(n).includes('3 REELS'));
    expect(flatText(runs[runs.length - 1])).toContain('EST.');
  });

  it('a ranked stack numbers its holdings and an unranked one does not', () => {
    // Numbers read as rank whatever the label says, so only a ranked stack
    // carries them — an index may number its holdings, but a reader will not
    // believe it is merely an index.
    expect(SOURCE).toContain('{isRanked ? (');
    expect(SOURCE).toContain('<View style={s.filmCaptionRow}>');
    // The unranked branch renders the plain caption and nothing else — located
    // by its own caption rather than by slicing between loose delimiters, which
    // is how the first version of this matched the whole component.
    const ranked = SOURCE.indexOf('<View style={s.filmCaptionRow}>');
    const plain = SOURCE.indexOf('<Text style={s.filmTitle} numberOfLines={2}>');
    expect(plain).toBeGreaterThan(ranked);
    expect(SOURCE.slice(plain, plain + 120)).not.toContain('filmRank');
  });

  it('a sealed stack shows its key only to the curator', () => {
    expect(SOURCE).toMatch(/list.isPrivate && isOwner/);
  });

  it('a stack sealed against you is not merely empty', () => {
    // A private stack reached by direct link is CLASSIFIED, beside the RLS gate.
    expect(SOURCE).toMatch(/list.isPrivate && !isOwner/);
    expect(SOURCE).toContain('CLASSIFIED');
  });

  it('a queued critique keeps its place in the count', () => {
    // The optimistic critique stays in cache when it is queued offline, so the
    // number must stay with it. Only a real failure takes it back.
    const submit = SOURCE.slice(SOURCE.indexOf('const handleSubmitComment'), SOURCE.indexOf('const handleOpenShareLounge'));
    const offline = submit.slice(submit.indexOf('isNetworkError'), submit.indexOf('} else {'));
    expect(offline).not.toMatch(/bumpCritiqueCount/);
    expect(submit.slice(submit.indexOf('} else {'))).toContain('bumpCritiqueCount(-1)');
  });
});

describe('the fold is driven, not merely described', () => {
  /**
   * The source-reading tests above passed while the feature was BROKEN.
   * onTextLayout reports the lines it actually laid out, so measuring on the
   * clamped Text returned four, and "4 > 4" meant READ MORE could never
   * appear — worse than the character count it replaced. Only firing the
   * layout event catches that.
   */
  const layout = async (r: ReturnType<typeof mount>, lines: number) => {
    const measurer = walk(r).find(n => {
      const st = Object.assign({}, ...[n.props?.style].flat(2).filter(Boolean));
      return st.opacity === 0 && st.position === 'absolute' && typeof n.props?.onTextLayout === 'function';
    });
    expect(measurer).toBeDefined();
    await act(async () => {
      measurer!.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: lines }, () => ({})) } });
    });
  };

  it('offers the fold once the text genuinely overruns', async () => {
    const r = mount({ description: 'A collection of psychological horror films.' });
    expect(r.queryByText(/READ MORE/)).toBeNull();      // nothing measured yet
    await layout(r, 9);
    await waitFor(() => expect(r.getByText(/READ MORE/)).toBeTruthy());
  });

  it('offers nothing when the text fits', async () => {
    const r = mount({ description: 'Short.' });
    await layout(r, 2);
    expect(r.queryByText(/READ MORE/)).toBeNull();
  });

  it('offers nothing at exactly the clamp', async () => {
    // The off-by-one that decides whether a page invites you to open what is
    // already fully visible.
    const r = mount({ description: 'Exactly four lines of prose.' });
    await layout(r, 4);
    expect(r.queryByText(/READ MORE/)).toBeNull();
  });

  it('measures with an UNCLAMPED copy, or it measures the clamp', async () => {
    const r = mount({ description: 'A collection of psychological horror films.' });
    const measurer = walk(r).find(n =>
      typeof n.props?.onTextLayout === 'function' && n.props?.numberOfLines === undefined);
    expect(measurer!.props.numberOfLines).toBeUndefined();
  });

  it('the measurer leaves once it has answered, and is invisible while it stays', async () => {
    const r = mount({ description: 'A collection of psychological horror films.' });
    // onTextLayout is what makes it the measurer. Without that clause this
    // matched the nav's BlurView, which is also absolute and also sits at
    // opacity 0 while the page is at rest — a loose predicate finding a
    // confidently wrong node.
    const isMeasurer = (n: any) => {
      const st = Object.assign({}, ...[n.props?.style].flat(2).filter(Boolean));
      return st.opacity === 0 && st.position === 'absolute' && typeof n.props?.onTextLayout === 'function';
    };
    const before = walk(r).find(isMeasurer);
    // Never read aloud twice: the epigraph is on screen once, and a screen
    // reader must not find a second, invisible copy of it.
    expect(before!.props.importantForAccessibility).toBe('no-hide-descendants');
    await layout(r, 9);
    await waitFor(() => expect(walk(r).find(isMeasurer)).toBeUndefined());
  });

  it('folds back open and shut', async () => {
    const r = mount({ description: 'A collection of psychological horror films.' });
    await layout(r, 9);
    await waitFor(() => expect(r.getByText(/READ MORE/)).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByText(/READ MORE/)); });
    await waitFor(() => expect(r.getByText(/FOLD/)).toBeTruthy());
  });
});

describe('the film card, actually rendered', () => {
  const FILMS = [
    { id: 1, title: 'Perfect Blue', poster_path: '/pb.jpg' },
    { id: 2, title: '28 Years Later: The Bone Temple', poster_path: '/by.jpg' },
    { id: 3, title: 'No Artwork Here', poster_path: null },
  ];

  /** Style of the caption under a given film, flattened. */
  const captionOf = (r: ReturnType<typeof mount>, title: string) =>
    Object.assign({}, ...[r.getByText(title).props.style].flat(2).filter(Boolean));

  it('draws every film in the stack', async () => {
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    for (const f of FILMS) expect(r.getByText(f.title)).toBeTruthy();
  });

  it('reserves the same caption height whether the title takes one line or two', async () => {
    // The whole reason the rows stopped sharing a baseline. A source read said
    // minHeight: 28 was declared; only rendering says it is APPLIED, to both.
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    const short = captionOf(r, 'Perfect Blue');
    const long = captionOf(r, '28 Years Later: The Bone Temple');
    expect(short.minHeight).toBe(28);
    expect(long.minHeight).toBe(short.minHeight);
    expect(r.getByText('Perfect Blue').props.numberOfLines).toBe(2);
  });

  it('reserves that height in a RANKED stack too', async () => {
    // The ranked branch uses a different caption style, and the mutation run
    // proved nothing was watching it: stripping its minHeight escaped every
    // test. A ranked stack's rows could ripple exactly as the unranked ones
    // used to, and the index is the one place regularity is the whole point.
    const r = mount({ films: FILMS, filmCount: 3, isRanked: true });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    const short = captionOf(r, 'Perfect Blue');
    const long = captionOf(r, '28 Years Later: The Bone Temple');
    expect(short.minHeight).toBe(28);
    expect(long.minHeight).toBe(short.minHeight);
  });

  it('a film with no artwork is named ONCE, not twice', async () => {
    // The placeholder printed the film's name inside the card while the
    // caption printed it directly beneath — the same words stacked, which
    // reads as a bug rather than a missing poster. Found only by rendering it.
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('No Artwork Here')).toBeTruthy());
    expect(r.getAllByText('No Artwork Here')).toHaveLength(1);
    // and the empty frame still looks deliberate
    expect(r.getByText('✦')).toBeTruthy();
  });

  it('an unranked stack carries no numerals at all', async () => {
    const r = mount({ films: FILMS, filmCount: 3, isRanked: false });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    expect(r.queryByText('1')).toBeNull();
    expect(r.queryByText('2')).toBeNull();
  });

  it('a ranked stack numbers its holdings in the caption, off the artwork', async () => {
    const r = mount({ films: FILMS, filmCount: 3, isRanked: true });
    await waitFor(() => expect(r.getByText('1')).toBeTruthy());
    expect(r.getByText('2')).toBeTruthy();
    expect(r.getByText('3')).toBeTruthy();
    // The numeral is a sibling of the title, not a layer over the poster: the
    // old badge sat absolutely positioned inside the card under a gradient.
    const numeral = r.getByText('1');
    const style = Object.assign({}, ...[numeral.props.style].flat(2).filter(Boolean));
    expect(style.position).not.toBe('absolute');
  });

  it('only the first of a ranked stack earns candlelight', async () => {
    const r = mount({ films: FILMS, filmCount: 3, isRanked: true });
    await waitFor(() => expect(r.getByText('1')).toBeTruthy());
    const colour = (t: string) =>
      Object.assign({}, ...[r.getByText(t).props.style].flat(2).filter(Boolean)).color;
    expect(colour('1')).not.toBe(colour('2'));
    expect(colour('2')).toBe(colour('3'));
  });

  it('the cell is as wide as the column arithmetic says', async () => {
    // ITEM_WIDTH = (width - 18 - 42) / 3, and the card must actually be given it.
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    const cards = walk(r).filter(n => {
      const st = Object.assign({}, ...[n.props?.style].flat(2).filter(Boolean));
      return st.borderRadius === 2 && typeof st.height === 'number' && typeof st.width === 'number';
    });
    expect(cards.length).toBe(FILMS.length);
    const w = Object.assign({}, ...[cards[0].props.style].flat(2).filter(Boolean)).width;
    for (const c of cards) {
      const st = Object.assign({}, ...[c.props.style].flat(2).filter(Boolean));
      expect(st.width).toBe(w);                    // one column, every cell equal
      expect(st.height).toBeCloseTo(w * 1.5, 5);   // and a poster's 2:3
    }
  });

  it('a film that has been logged is marked, and one that has not is bare', async () => {
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    // No logs in the mocked store, so nothing should be badged.
    const badges = walk(r).filter(n => {
      const st = Object.assign({}, ...[n.props?.style].flat(2).filter(Boolean));
      return st.borderRadius === 11 && st.width === 22;
    });
    expect(badges).toHaveLength(0);
  });
});

describe('filing a critique — what the action actually does', () => {
  const open = async (over: Record<string, unknown> = {}) => {
    const r = mount({ critiqueCount: 3, ...over });
    await waitFor(() => expect(r.getByText(/CRITIQUES/)).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText(/critiques?/i)); });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    return r;
  };

  const file = async (r: ReturnType<typeof mount>, text: string) => {
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack critique'), text); });
    await act(async () => { fireEvent.press(r.getByLabelText('Submit critique')); });
  };

  /** Every ['stack', id] cache write the page made, as the updater's result. */
  const stackWrites = () => mockSetQueryData.mock.calls
    .filter(c => Array.isArray(c[0]) && c[0][0] === 'stack')
    .map(c => (typeof c[1] === 'function' ? c[1]({ list: { critiqueCount: 3 } }) : c[1]));

  it('shows the critique before the server has answered', async () => {
    mockAddComment.mockResolvedValue({ id: 'real', user_id: 'u1', username: 'morpho', content: 'x', created_at: '2026-01-01' });
    const r = await open();
    await file(r, 'The Others belongs here.');
    const commentWrites = mockSetQueryData.mock.calls.filter(c => c[0][0] === 'stackComments');
    expect(commentWrites.length).toBeGreaterThan(0);
  });

  it('moves the number in step with the list', async () => {
    mockAddComment.mockResolvedValue({ id: 'real', user_id: 'u1', username: 'morpho', content: 'x', created_at: '2026-01-01' });
    const r = await open();
    await file(r, 'A critique.');
    expect(stackWrites().some(w => w?.list?.critiqueCount === 4)).toBe(true);
  });

  it('takes the number back when the filing genuinely fails', async () => {
    mockAddComment.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }));
    const r = await open();
    await file(r, 'A critique.');
    await waitFor(() => expect(stackWrites().some(w => w?.list?.critiqueCount === 2)).toBe(true));
  });

  it('but NOT when it was queued offline, because the critique is still there', async () => {
    // The optimistic critique stays in cache when queued, so the count must
    // stay with it. Decrementing here would show 3 beside four visible entries.
    mockAddComment.mockRejectedValue(new TypeError('Network request failed'));
    const r = await open();
    await file(r, 'A critique.');
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    expect(stackWrites().some(w => w?.list?.critiqueCount === 2)).toBe(false);
  });

  it('never invents a count the server never gave', async () => {
    // critiqueCount null means "could not ask". Filing one must not turn that
    // into a confident 1.
    mockAddComment.mockResolvedValue({ id: 'real', user_id: 'u1', username: 'morpho', content: 'x', created_at: '2026-01-01' });
    const r = await open({ critiqueCount: null });
    await file(r, 'A critique.');
    const writes = mockSetQueryData.mock.calls
      .filter(c => Array.isArray(c[0]) && c[0][0] === 'stack')
      .map(c => (typeof c[1] === 'function' ? c[1]({ list: { critiqueCount: null } }) : c[1]));
    for (const w of writes) expect(w?.list?.critiqueCount ?? null).toBeNull();
  });

  it('will not file nothing, and will not file whitespace', async () => {
    // Named for what it actually proves. An earlier version claimed the
    // HANDLER refuses, and a mutation stripping that guard escaped — because
    // the press never reaches it: the button is disabled, so nothing fires.
    // The handler's own check is unreachable belt-and-braces, which is worth
    // keeping and not worth claiming.
    const r = await open();
    const send = r.getByLabelText('Submit critique');
    expect(send.props.accessibilityState?.disabled ?? send.props.disabled).toBe(true);

    // Spaces are not a critique — the field is empty as far as anyone is
    // concerned, and the button must stay shut.
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack critique'), '    '); });
    const stillShut = r.getByLabelText('Submit critique');
    expect(stillShut.props.accessibilityState?.disabled ?? stillShut.props.disabled).toBe(true);
    await act(async () => { fireEvent.press(stillShut); });
    expect(mockAddComment).not.toHaveBeenCalled();

    // and it opens the moment there is something to say
    await act(async () => { fireEvent.changeText(r.getByLabelText('Stack critique'), 'A real one.'); });
    const open2 = r.getByLabelText('Submit critique');
    expect(open2.props.accessibilityState?.disabled ?? open2.props.disabled).toBeFalsy();
  });
});

describe('the overlay’s back button, driven', () => {
  it('closes the critiques and leaves the page standing', async () => {
    const r = mount({ critiqueCount: 2 });
    await waitFor(() => expect(r.getByText(/CRITIQUES/)).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText(/critiques?/i)); });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());

    expect(mockBackHandlers.length).toBeGreaterThan(0);
    let consumed = false;
    await act(async () => { consumed = mockBackHandlers[mockBackHandlers.length - 1](); });

    expect(consumed).toBe(true);                       // or Android leaves the page too
    await waitFor(() => expect(r.queryByText('THE CRITIQUES')).toBeNull());
    expect(r.getByText(/INDEXED REELS/)).toBeTruthy(); // the page is still here
  });

  it('registers nothing while the critiques are shut', async () => {
    mount({ critiqueCount: 2 });
    await waitFor(() => expect(mockBackHandlers).toHaveLength(0));
  });
});
