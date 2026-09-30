/**
 * stack-detail.redesign.test.tsx — the catalogue, mounted: chrome with a
 * ground, one left edge, a hero from the first poster that exists, a fold by
 * measured lines, legible dates. Pure geometry (the column's three numbers) is
 * read from the source, as layout arithmetic shows nothing until a device.
 */
import React, { act } from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

import StackDetailScreen from '../[id]';

const STACK_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE = readFileSync(join(__dirname, '..', '[id].tsx'), 'utf8');

/** Swapped per test, then read by the mocked useQuery below. */
let mockStackData: Record<string, unknown> | null | undefined;
/** The stack's read failed (React Query's isError). */
let mockStackFailed = false;
const mockRereadStack = jest.fn();
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
// Buster (in the failed state) pauses when its screen is not focused.
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => true }));
const mockSetQueryData = jest.fn();
/** What each query says after a pull: `error` when it reached nothing. */
let mockQueryState: Record<string, { status: string } | undefined> = {};
/** The critiques the page holds. */
let mockComments: Record<string, unknown>[] = [];
const mockDeleteComment = jest.fn();
/** The list's pull, as the screen hands it over. */
let mockRefresh: { props: { onRefresh: () => Promise<void> } } | null = null;
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
/** The stack query's options, so a test can run its real queryFn. */
let mockStackOpts: { queryFn: () => Promise<{ list: Record<string, unknown> }> } | null = null;
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
  useQueryClient: () => ({
    setQueryData: mockSetQueryData, removeQueries: jest.fn(),
    getQueryData: jest.fn((key: unknown[]) => (key[0] === 'stackComments' ? mockComments : undefined)),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()),
    getQueryState: (key: unknown[]) => mockQueryState[String(key[0])],
  }),
  useQuery: (opts: { queryKey: unknown[] }) => {
    const key = String(opts.queryKey[0]);
    if (key === 'stackComments') return { data: mockComments };
    if (key === 'stack') {
      mockStackOpts = opts as never;
      return { data: mockStackData, isLoading: false, isError: mockStackFailed, refetch: mockRereadStack };
    }
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
jest.mock('@/src/stores/tellMarks', () => ({ tellMarks: jest.fn() }));
const mockAddComment = jest.fn();
jest.mock('@/src/services/StackService', () => ({
  StackService: {
    getStackFullPayload: jest.fn(), getStackComments: jest.fn(),
    addStackComment: (...a: unknown[]) => mockAddComment(...a),
    deleteStackComment: (...a: unknown[]) => mockDeleteComment(...a),
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
  return { CinematicFlashList: ({ ListHeaderComponent, ListEmptyComponent, data, renderItem, refreshControl }: {
    ListHeaderComponent?: React.ReactNode; ListEmptyComponent?: React.ReactNode;
    data?: unknown[]; renderItem?: (a: { item: unknown; index: number }) => React.ReactNode;
    refreshControl?: unknown;
  }) => (mockRefresh = refreshControl as never, React.createElement(View, null,
    render(ListHeaderComponent),
    // Every row rendered, so the index is tested as drawn.
    ...(data ?? []).map((item, index) =>
      React.createElement(React.Fragment, { key: index }, renderItem ? renderItem({ item, index }) : null)),
    (data ?? []).length === 0 ? render(ListEmptyComponent) : null)) };
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
  mockStackFailed = false;
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
    // Loading, unreachable and the stack: three call sites, one component.
    // Four states wear it: loading, could not be reached, classified, the stack.
    expect(SOURCE.match(/<StackNav /g) ?? []).toHaveLength(4);
    expect(SOURCE.match(/s\.navBar/g) ?? []).toHaveLength(1);
  });
});

describe('one column', () => {
  it('the three numbers that make the margin still agree', () => {
    // 9 (page) + 7 (cell) = 16, and 7 + 7 = a 14 gutter; the hero wrap's 7
    // puts the title on the posters' edge.
    const num = (style: string, prop: string) => {
      const body = SOURCE.slice(SOURCE.indexOf(`${style}: {`));
      return Number(body.slice(0, body.indexOf('}')).match(new RegExp(`${prop}: (\\d+)`))![1]);
    };
    const page = num('scrollContent', 'paddingHorizontal');
    const wrap = num('headerContentWrap', 'paddingHorizontal');
    const cell = num('filmItem', 'marginHorizontal');
    expect(page + cell).toBe(16);
    expect(page + wrap).toBe(page + cell);          // title and posters, one edge
    // The cell: the window less the same 9s and 7s, for any number of columns.
    expect(SOURCE).toContain(`const ITEM_WIDTH = (windowWidth - ${page * 2} - ${cell * 2} * COLUMNS) / COLUMNS;`);
  });
});

describe('the hero', () => {
  it('survives a first film with no artwork', async () => {
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
    // Whole points: the room's light hangs from this hem and the veil meets it.
    expect(SOURCE).toMatch(/HEADER_HEIGHT = Math\.round\(insets\.top \+ Math\.min\(320, Math\.max\(236/);
    expect(SOURCE).not.toMatch(/HEADER_HEIGHT = windowHeight \* 0\.45/);
  });

  it('sets a long title smaller rather than cutting it', () => {
    // Steps from the measured width, for the 100 characters a title may hold.
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
    // Two lines at the size the phone draws them, on the card, for BOTH styles.
    const cap = SOURCE.slice(SOURCE.indexOf('filmTitle: {'));
    expect(cap.slice(0, cap.indexOf('}'))).toMatch(/lineHeight: FILM_TITLE_LINE/);
    expect(SOURCE).toMatch(/const FILM_TITLE_LINE = 14;/);
    expect(SOURCE).toMatch(/const titleBox = \{ minHeight: FILM_TITLE_LINE \* 2 \* useLineScale\(\) \};/);
    expect(SOURCE).toMatch(/style=\{\[s\.filmTitleInline, titleBox\]\}/);
    expect(SOURCE).toMatch(/style=\{\[s\.filmTitle, titleBox\]\}/);
  });

  it('keeps the rank off the artwork', () => {
    expect(SOURCE).not.toMatch(/rankBadgeWrap/);
    expect(SOURCE).toMatch(/filmCaptionRow/);
  });

  it('states its own bound when a stack outgrows the fetch', async () => {
    // The true count beside a capped grid says how much of it is drawn.
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
  // The count hangs beside the icon (MarkFigure) and the word is the house's
  // one word for the act, CRITIQUE, as on every other bar.
  it('says what it holds', async () => {
    const r = mount({ critiqueCount: 12 });
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
    expect(r.getByText('12', { includeHiddenElements: true })).toBeTruthy();
    expect(r.getByLabelText('Critiques. 12 critiques')).toBeTruthy();
  });

  it('says nothing rather than a confident zero when the count failed', async () => {
    // null is "we could not ask", which is not the same statement as "none".
    const r = mount({ critiqueCount: null });
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
    expect(r.queryByText('0', { includeHiddenElements: true })).toBeNull();
    expect(r.getByLabelText('Critiques')).toBeTruthy();
  });

  it('carries the server’s count from the service to the screen', async () => {
    // useQuery is replaced above, so the screen's own queryFn is run by hand:
    // its mapping of the service's answer is what reaches the bar on a phone.
    const { StackService } = require('@/src/services/StackService');
    StackService.getStackFullPayload.mockResolvedValueOnce({
      ...baseStack, endorseCount: 2, certified: false, critiqueCount: 7,
    });
    mount();
    const answer = await mockStackOpts!.queryFn();
    expect(answer.list.critiqueCount).toBe(7);
  });

  it('is one source of truth, so a refetch cannot double-count', () => {
    // A second tally would double on a refetch; the cached payload is nudged.
    expect(SOURCE).toMatch(/bumpCritiqueCount/);
    expect(SOURCE).not.toMatch(/critiquesFiled/);
    // and it never invents a count where the server gave none
    expect(SOURCE).toMatch(/if \(typeof current !== 'number'\) return old;/);
  });
});

describe('the epigraph folds only when there is more', () => {
  it('is measured, not guessed from a character count', () => {
    // A character count disagrees with a line clamp both ways.
    expect(SOURCE).toMatch(/descNeedsFold = measuredFor === list\.description && descLineCount > DESC_CLAMP_LINES/);
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
    // ash would read 1.27:1 against the panel.
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
    // Only the import line may name FadeIn without reduceMotion.
    const offenders = SOURCE.split('\n')
      .filter(l => /FadeIn(Down|Up)\./.test(l) && !/reduceMotion\(ReduceMotion\.System\)/.test(l));
    expect(offenders).toEqual([]);
  });
});

describe('the critiques overlay', () => {
  const openIt = async (over: Record<string, unknown> = {}) => {
    const r = mount(over);
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
    const action = r.getByLabelText(/critiques?/i);
    await act(async () => { fireEvent.press(action); });
    return r;
  };

  it('opens over the page instead of pushing the index down', async () => {
    const r = await openIt();
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    // The index is still mounted and still above it in the page.
    expect(r.getByText(/INDEXED REELS/)).toBeTruthy();
    expect(SOURCE).not.toMatch(/showComments && \(\s*<Animated\.View[\s\S]{0,80}commentsPanel/);
  });

  it('is NOT a Modal, so the moderation sheet cannot stack on it', () => {
    // The moderation sheet a long-press opens IS a Modal; Modal over Modal is the iOS trap.
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
    // TWO: the ✕, and the strip of page above the sheet.
    await waitFor(() => expect(r.getAllByLabelText('Close critiques').length).toBeGreaterThanOrEqual(2));
  });

  it('says what it holds, in the sheet as well as on the button', async () => {
    const r = await openIt({ critiqueCount: 12 });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    expect(r.getAllByText('12').length).toBeGreaterThan(0);
  });

  it('and prints no zero in the sheet when there are none', async () => {
    const r = await openIt({ critiqueCount: 0 });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    expect(r.queryAllByText('0', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('and uses the house’s one number format there', async () => {
    const r = await openIt({ critiqueCount: 1200 });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    expect(r.getByText('1.2K')).toBeTruthy();
  });

  it('invites the first critique rather than showing an empty box', async () => {
    const r = await openIt();
    await waitFor(() => expect(r.getByText(/Be the first to speak/)).toBeTruthy());
  });

  it('focuses the field on the way in and not on the way out', () => {
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
    // As DECLARATIONS: `placeholderText` also begins the live `placeholderTextColor`.
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
    // A RELATION, not a number: the steps depend on the screen's width.
    const short = await titleSetting('Noir');
    const long = await titleSetting(LONG_TITLE);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(long.lines).toBeGreaterThan(short.lines);
  });

  it('a short title keeps the full display size', async () => {
    expect((await titleSetting('Noir')).fontSize).toBe(36);
  });

  it('a very long curator handle cannot push the date onto a line of its own', async () => {
    const r = mount({ user: 'a'.repeat(40), filmCount: 3 });
    await waitFor(() => expect(r.getByText(/3 REELS/)).toBeTruthy());
    const runs = walk(r).filter(n => flatText(n).includes('3 REELS'));
    expect(flatText(runs[runs.length - 1])).toContain('EST.');
  });

  it('a ranked stack numbers its holdings and an unranked one does not', () => {
    // Numbers read as rank whatever the label says, so only a ranked stack has them.
    expect(SOURCE).toContain('{isRanked ? (');
    expect(SOURCE).toContain('<View style={s.filmCaptionRow}>');
    // The unranked branch, found by its own caption: the plain title alone.
    const ranked = SOURCE.indexOf('<View style={s.filmCaptionRow}>');
    const plain = SOURCE.indexOf('<Text style={[s.filmTitle, titleBox]} numberOfLines={2}>');
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
    // Queued offline, the critique stays, so its count does; a real failure takes it back.
    const submit = SOURCE.slice(SOURCE.indexOf('const handleSubmitComment'), SOURCE.indexOf('const handleOpenShareLounge'));
    const offline = submit.slice(submit.indexOf('isNetworkError'), submit.indexOf('} else {'));
    expect(offline).not.toMatch(/bumpCritiqueCount/);
    expect(submit.slice(submit.indexOf('} else {'))).toContain('bumpCritiqueCount(-1)');
  });
});

describe('the fold is driven, not merely described', () => {
  // Fires the measurer's layout event: only driving it shows the fold appears
  // (a clamped Text reports the clamp, and "4 > 4" never opens).
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
    const r = mount({ description: 'Exactly four lines of prose.' }); // the off-by-one
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
    // onTextLayout makes it the measurer (the nav's BlurView is also absolute at 0).
    const isMeasurer = (n: any) => {
      const st = Object.assign({}, ...[n.props?.style].flat(2).filter(Boolean));
      return st.opacity === 0 && st.position === 'absolute' && typeof n.props?.onTextLayout === 'function';
    };
    const before = walk(r).find(isMeasurer);
    // Never read aloud twice: the invisible copy is hidden from screen readers.
    expect(before!.props.importantForAccessibility).toBe('no-hide-descendants');
    await layout(r, 9);
    await waitFor(() => expect(walk(r).find(isMeasurer)).toBeUndefined());
  });

  it('re-measures when the epigraph itself changes', async () => {
    // A refresh brings new words without a remount; the old answer must go.
    const r = mount({ description: 'A long one.' });
    await layout(r, 9);
    await waitFor(() => expect(r.getByText(/READ MORE/)).toBeTruthy());

    // the curator shortens it, and the page refreshes in place
    mockStackData = { list: { ...baseStack, description: 'Now short.' }, endorseCount: 0 };
    await act(async () => { r.rerender(<StackDetailScreen />); });

    // the old measurement must not survive the words it measured
    await waitFor(() => expect(r.queryByText(/READ MORE/)).toBeNull());
    await layout(r, 2);
    expect(r.queryByText(/READ MORE/)).toBeNull();
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
    // Rendered: the reserve is APPLIED, to both, not only declared.
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    const short = captionOf(r, 'Perfect Blue');
    const long = captionOf(r, '28 Years Later: The Bone Temple');
    expect(short.minHeight).toBe(28);
    expect(long.minHeight).toBe(short.minHeight);
    expect(r.getByText('Perfect Blue').props.numberOfLines).toBe(2);
  });

  it('reserves that height in a RANKED stack too', async () => {
    // Its own caption style, so its own test (a mutation escaped without it).
    const r = mount({ films: FILMS, filmCount: 3, isRanked: true });
    await waitFor(() => expect(r.getByText('Perfect Blue')).toBeTruthy());
    const short = captionOf(r, 'Perfect Blue');
    const long = captionOf(r, '28 Years Later: The Bone Temple');
    expect(short.minHeight).toBe(28);
    expect(long.minHeight).toBe(short.minHeight);
  });

  it('a film with no artwork is named ONCE, not twice', async () => {
    const r = mount({ films: FILMS, filmCount: 3 });
    await waitFor(() => expect(r.getByText('No Artwork Here')).toBeTruthy());
    expect(r.getAllByText('No Artwork Here')).toHaveLength(1);
    // and the empty frame still looks deliberate — drawn, and not read aloud as
    // "black four-pointed star" (the app's Text hides a Text of only ornament).
    expect(r.getByText('✦', { includeHiddenElements: true })).toBeTruthy();
    expect(r.queryByText('✦')).toBeNull();
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
    // A sibling of the title, never a layer over the poster.
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
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
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
    // Else it would show 3 beside four visible critiques.
    mockAddComment.mockRejectedValue(new TypeError('Network request failed'));
    const r = await open();
    await file(r, 'A critique.');
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalled());
    expect(stackWrites().some(w => w?.list?.critiqueCount === 2)).toBe(false);
  });

  it('never invents a count the server never gave', async () => {
    // null is "could not ask": filing one must not make it a confident 1.
    mockAddComment.mockResolvedValue({ id: 'real', user_id: 'u1', username: 'morpho', content: 'x', created_at: '2026-01-01' });
    const r = await open({ critiqueCount: null });
    await file(r, 'A critique.');
    const writes = mockSetQueryData.mock.calls
      .filter(c => Array.isArray(c[0]) && c[0][0] === 'stack')
      .map(c => (typeof c[1] === 'function' ? c[1]({ list: { critiqueCount: null } }) : c[1]));
    for (const w of writes) expect(w?.list?.critiqueCount ?? null).toBeNull();
  });

  it('will not file nothing, and will not file whitespace', async () => {
    // The BUTTON refuses (disabled), so a press never reaches the handler's own check.
    const r = await open();
    const send = r.getByLabelText('Submit critique');
    expect(send.props.accessibilityState?.disabled ?? send.props.disabled).toBe(true);

    // Spaces are not a critique.
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
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
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

describe('a stack it could not reach is not a sealed one', () => {
  // It was CLASSIFIED — "sealed or incinerated" — of a stack simply out of reach.
  it('says it could not be reached, and asks again', async () => {
    mockStackFailed = true;
    mockStackData = undefined;
    const r = render(<StackDetailScreen />);
    expect(r.queryByText('CLASSIFIED')).toBeNull();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
    expect(mockRereadStack).toHaveBeenCalledTimes(1);
  });

  it('a stack that is not there (the service answered null) is CLASSIFIED', () => {
    mockStackFailed = false;
    mockStackData = null;
    const r = render(<StackDetailScreen />);
    expect(r.getByText('CLASSIFIED')).toBeTruthy();
    expect(r.queryByText('Transmission Interrupted')).toBeNull();
  });
});

describe('a pull that reached nothing', () => {
  beforeEach(() => { mockQueryState = {}; mockToastError.mockClear(); });

  it('keeps the stack, and says so — it said nothing', async () => {
    mount();
    mockQueryState = { stack: { status: 'error' } };
    await act(async () => { await mockRefresh!.props.onRefresh(); });
    expect(mockToastError).toHaveBeenCalledWith('Could not refresh — check your connection.');
  });

  it('a pull that was answered says nothing', async () => {
    mount();
    mockQueryState = { stack: { status: 'success' }, stackComments: { status: 'success' } };
    await act(async () => { await mockRefresh!.props.onRefresh(); });
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('taking back one’s own critique on a stack', () => {
  const MINE = { id: 'c-mine', list_id: STACK_ID, user_id: 'u1', username: 'morpho', avatar_url: null, content: 'Mine.', created_at: '2026-01-01T10:00:00Z' };
  const THEIRS = { id: 'c-theirs', list_id: STACK_ID, user_id: 'u9', username: 'vesper', avatar_url: null, content: 'Theirs.', created_at: '2026-01-02T10:00:00Z' };
  const open = async () => {
    const r = mount({ critiqueCount: 2 });
    await waitFor(() => expect(r.getByText('CRITIQUE')).toBeTruthy());
    await act(async () => { fireEvent.press(r.getByLabelText(/critiques?/i)); });
    await waitFor(() => expect(r.getByText('THE CRITIQUES')).toBeTruthy());
    return r;
  };
  /** The critiques after every write the page made to them, in order, from what it held. */
  const lastCommentsWrite = () => mockSetQueryData.mock.calls
    .filter((c) => c[0][0] === 'stackComments')
    .reduce((held, [, w]) => (typeof w === 'function' ? w(held) : w), mockComments as unknown) as { id: string }[];

  beforeEach(() => { mockComments = [MINE, THEIRS]; mockDeleteComment.mockReset(); mockToastError.mockClear(); mockSetQueryData.mockClear(); });
  afterEach(() => { mockComments = []; });

  it('is offered on the member’s own critique alone — it was offered on none', async () => {
    const r = await open();
    expect(r.getAllByLabelText('Delete your critique')).toHaveLength(1);
  });

  it('takes it off the page and asks the house', async () => {
    mockDeleteComment.mockResolvedValue(undefined);
    const r = await open();
    await act(async () => { fireEvent.press(r.getByLabelText('Delete your critique')); });
    expect(mockDeleteComment).toHaveBeenCalledWith('c-mine', 'u1');
    expect(lastCommentsWrite().map((c) => c.id)).toEqual(['c-theirs']);
  });

  it('a refused removal puts it back, and says so', async () => {
    mockDeleteComment.mockRejectedValue({ code: '42501', message: 'refused' });
    const r = await open();
    await act(async () => { fireEvent.press(r.getByLabelText('Delete your critique')); });
    expect(lastCommentsWrite().map((c) => c.id)).toEqual(['c-mine', 'c-theirs']);
    expect(mockToastError).toHaveBeenCalledWith('Your critique could not be removed.');
  });
});
