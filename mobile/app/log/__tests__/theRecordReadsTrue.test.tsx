/**
 * theRecordReadsTrue.test.tsx — the record page, mounted, and asked.
 *
 * logSurfaces.test.ts held these as text: "the file contains `&& s.rtl` three
 * times", "the screen contains `shareCardMounted &&`". That says a thing is
 * spelled; this says it happens. The real screen, its query function and its
 * handlers (the same stand-ins as theLogPageMovesEveryCard), with a member's
 * own words in each shape that once went wrong:
 *
 *   · a record prints facts, never the composer's "None" or an empty "WITH";
 *   · a member's writing is set in its own direction, on every block of it —
 *     the review, the pull quote, a critique, a past viewing — and a joined
 *     script never has its first letter lifted out as a drop cap;
 *   · a rating with no words draws no empty review section;
 *   · the share card exists only while a share is in flight, is captured only
 *     once it says it is whole, and is gone after a failed one too;
 *   · a visitor can save the film, as they can from its card;
 *   · a share that failed says so;
 *   · a record that could not be read is never "Log not found", and a way out
 *     says where it goes.
 *
 * Whether each of these FITS — every width, every text size — is measured on
 * the drawn page (zz-log.gen, mockups/tools/layout.cjs).
 */
import React, { act } from 'react';
import { View, StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { resetMarkCounts } from '@/src/stores/markCounts';
import { FrameWords } from '@/src/components/feed/ActivityCard';

import LogDetailScreen from '../[id]';

const LOG_ID = '22222222-2222-4222-8222-222222222222';
/** The Reel's frame on a 390pt phone at the first text size: its words' room, and nothing pressed. */
const FRAME_WORDS = { inner: 330, scale: 1, accent: '#B8891A', onPress: () => {} };
const ARABIC = 'يُعد هذا الفيلم تأملاً في الانتظار';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

let mockQuery: Record<string, unknown>;
let mockOptions: { queryFn: (ctx: { signal?: AbortSignal }) => Promise<Record<string, unknown>> };
let mockCache: Record<string, unknown> | undefined;
/** What the record's query says after a pull: `error` when it reached nothing. */
let mockQueryState: { status: string } | undefined;
/** The feeds held in the cache, as getQueriesData answers: [key, data] pairs. */
let mockFeeds: [unknown[], unknown][] = [];
const mockToastError = jest.fn();
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: (...a: unknown[]) => mockToastError(...a), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  // the log's own read; any other on the page (the Lobby's honour) answers nothing
  useQuery: (opts: { queryKey: unknown[] }) => {
    if (opts.queryKey[0] !== 'log') return { data: undefined };
    mockOptions = opts as never;
    return mockQuery;
  },
  useQueryClient: () => ({
    setQueryData: jest.fn((_k: unknown, fn: (old: unknown) => unknown) => { mockCache = fn(mockCache) as never; }),
    getQueryData: jest.fn(() => mockCache),
    getQueryState: jest.fn(() => mockQueryState),
    // As React Query matches: a held key that begins with the key asked for.
    getQueriesData: jest.fn(({ queryKey }: { queryKey: unknown[] }) => mockFeeds.filter(([held]) => queryKey.every((part, i) => held[i] === part))),
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()), removeQueries: jest.fn(),
  }),
}));
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => mockCanGoBack },
  useLocalSearchParams: () => ({ id: '22222222-2222-4222-8222-222222222222' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: () => {},
}));
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: '33333333-3333-4333-8333-333333333333', username: 'visitor' }, isAuthenticated: true };
  const useAuthStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state) : state);
  (useAuthStore as unknown as { getState: () => unknown }).getState = () => state;
  return { useAuthStore };
});
jest.mock('@/src/hooks/useClearance', () => ({ useClearance: () => ({ held: true, standing: 'held', open: jest.fn() }) }));
jest.mock('@/src/hooks/useVault', () => ({ useVault: () => ({ note: null, loaded: true, unreachable: false }) }));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/utils/offlineQueue', () => ({
  enqueueMutation: jest.fn(() => true), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
// The card, drawn as a marker: what is under test is WHEN it exists, and that
// nothing is captured before it says every picture on it is drawn — which the
// test says for it, through the onReady it was given.
let mockCardReady: (() => void) | undefined;
jest.mock('@/src/components/film/LogShareCard', () => {
  const { View: V } = require('react-native');
  return ({ onReady }: { onReady?: () => void }) => { mockCardReady = onReady; return <V testID="share-card" />; };
});
// A test renderer has no native view to draw to a picture, so every capture fails.
const mockCaptureRef = jest.fn((..._: unknown[]) => Promise.reject(new Error('no native view')));
jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCaptureRef(...a) }));
jest.mock('@/src/services/LogService', () => ({
  LogService: { getLogDetails: jest.fn(), getLogComments: jest.fn(), addLogComment: jest.fn(), deleteLogComment: jest.fn() },
}));
const mockLogService = jest.requireMock('@/src/services/LogService').LogService as { getLogDetails: jest.Mock; getLogComments: jest.Mock; addLogComment: jest.Mock; deleteLogComment: jest.Mock };

const LOG = {
  id: LOG_ID, film_id: 843, film_title: 'In the Mood for Love', poster_path: null, year: 2000,
  rating: 5, review: 'Every corridor is a held breath.', pull_quote: null, drop_cap: false, alt_poster: null,
  status: 'watched', is_spoiler: false, watched_date: '2026-08-12', watched_with: null, physical_media: null,
  abandoned_reason: null, is_autopsied: false, autopsy: null, user_id: 'u1', created_at: '2026-08-12T21:00:00Z',
  editorial_header: null,
};
const PROFILE = { id: 'u1', username: 'morpho', role: 'archivist', avatar_url: null, member_no: 7 };

type R = ReturnType<typeof render>;
type J = { type: string; props: Record<string, any>; children: (J | string)[] | null };
function nodes(r: R): J[] {
  const out: J[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    out.push(j as J);
    ((j as J).children ?? []).forEach(go);
  };
  go(r.toJSON());
  return out;
}
const textOf = (j: J): string => (j.children ?? []).map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
const words = (r: R) => nodes(r).filter((n) => n.type === 'Text').map(textOf).join(' | ');
/** Every Text whose own words include `needle`, innermost first. */
const textsWith = (r: R, needle: string) => nodes(r).filter((n) => n.type === 'Text' && textOf(n).includes(needle)).reverse();
const rightToLeft = (n: J) => {
  const st = StyleSheet.flatten(n.props.style) ?? {};
  return st.writingDirection === 'rtl' && st.textAlign === 'right';
};

async function page(log: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Promise<R> {
  mockCache = { log: { ...LOG, ...log }, profile: PROFILE, comments: [], commentTotal: 0, certifyCount: 0, ...extra };
  mockQuery = { data: mockCache, isLoading: false };
  let r!: R;
  await act(async () => { r = render(<LogDetailScreen />); });
  return r;
}

beforeEach(() => {
  resetMarkCounts();
  const { useFilmStore } = jest.requireActual('@/src/stores/films');
  useFilmStore.setState({ _endorsedIndex: {}, interactions: [], logs: [], watchlist: [] });
  jest.clearAllMocks();
  mockFeeds = [];
});

describe('a record prints facts, and nothing else', () => {
  it('no "None" for a format, no empty "WITH", no band of nothing', async () => {
    const r = await page({ physical_media: 'None', watched_with: '   ', watched_date: null });
    expect(words(r)).not.toMatch(/\bNONE\b|\bNone\b/);
    expect(words(r)).not.toMatch(/\bWITH\b\s*(\||$)/);
  });

  it('the facts it has, it prints', async () => {
    const r = await page({ physical_media: 'VHS', watched_with: 'mara', watched_date: '2026-08-05' });
    const all = words(r);
    for (const fact of ['AUG 5, 2026', 'WITH MARA', 'VHS']) expect(all).toContain(fact);
  });

  it('read from the phone’s own store when the server cannot be reached, the same', async () => {
    // The fallback mapping used to pass the composer's 'None' straight through:
    // one log, read two ways — FORMAT: NONE offline, nothing online.
    const { useFilmStore } = jest.requireActual('@/src/stores/films');
    useFilmStore.setState({ logs: [{ id: LOG_ID, filmId: 843, title: 'In the Mood for Love', rating: 4, review: 'x', physicalMedia: 'None', watchedDate: '2026-08-05' }] });
    mockLogService.getLogDetails.mockRejectedValue(new Error('offline'));
    await page();
    mockCache = undefined;   // nothing cached: the fallback is the only answer
    let data: { log?: { physical_media?: unknown } } = {};
    await act(async () => { data = await mockOptions.queryFn({}) as typeof data; });
    expect(data.log).toBeDefined();
    expect(data.log!.physical_media).toBeNull();
  });
});

describe('a member’s writing is set in its own direction', () => {
  it('the review and the pull quote', async () => {
    const r = await page({ review: `<p>${ARABIC}</p><p>${ARABIC} مرة ثانية</p>`, pull_quote: ARABIC });
    const blocks = textsWith(r, ARABIC);
    // The quote, and both paragraphs — every block, not one of three.
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const b of blocks) expect(rightToLeft(b)).toBe(true);
  });

  it('and English stays left to right, even with Arabic inside it', async () => {
    const r = await page({ review: `Spider-Man ${ARABIC}` });
    for (const b of textsWith(r, 'Spider-Man')) expect(rightToLeft(b)).toBe(false);
  });

  it('a critique on the record', async () => {
    const r = await page({}, {
      comments: [{ id: 'c1', user_id: 'u9', username: 'layla', avatar_url: null, body: ARABIC, created_at: '2026-08-12T22:00:00Z' }],
      commentTotal: 1,
    });
    const blocks = textsWith(r, ARABIC);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(rightToLeft(b)).toBe(true);
  });

  it('a past viewing in the chronicle', async () => {
    const r = await page({
      viewing_history: [{ viewingId: 'v0', date: '2025-02-01', rating: 3, review: ARABIC, watchedWith: null }],
    });
    // Its words are shown once it is chosen on the strip.
    await act(async () => { await fireEvent.press(r.getByLabelText(/^first watch/)); });
    const blocks = textsWith(r, ARABIC);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(rightToLeft(b)).toBe(true);
  });

  it('the card on the Reel sets it the same way', async () => {
    let r!: R;
    await act(async () => {
      r = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote: ARABIC, review: ARABIC, drop_cap: false, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    });
    const blocks = textsWith(r, ARABIC);
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) expect(rightToLeft(b)).toBe(true);
  });
});

describe('a member’s own words survive being cleaned', () => {
  it('the card keeps their angle brackets, and loses only real tags', async () => {
    // The card's old private cleaner deleted anything between brackets, which
    // ate the first two words of `<The Batman> is the best of them`.
    let card!: R;
    await act(async () => {
      card = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote: null, review: '<p><The Batman> is the best of them</p>', drop_cap: false, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    });
    expect(words(card)).toContain('<The Batman> is the best of them');
    expect(words(card)).not.toContain('<p>');
  });

  it('and so does the record', async () => {
    const r = await page({ review: '<p><The Batman> is the best of them</p>' });
    expect(words(r)).toContain('<The Batman> is the best of them');
  });
});

describe('no drop cap on a joined script', () => {
  // Lifting the first letter out of an Arabic word leaves an isolated form and
  // breaks the word behind it.
  // A raised initial: a text of its own, never scaled, holding the opening
  // letter — which in Arabic is a letter AND its vowel mark ('يُ', two code
  // units), so a one-character test would never see the very case it guards.
  const lifted = (r: R) => nodes(r).filter((n) => n.type === 'Text' && n.props.allowFontScaling === false
    && textOf(n).length >= 1 && textOf(n).length <= 3 && /\p{L}/u.test(textOf(n)));

  it('English opens on a raised initial', async () => {
    const r = await page({ review: 'Every corridor is a held breath.', drop_cap: true });
    expect(lifted(r).map(textOf)).toContain('E');
  });

  it('Arabic never does — on the record or on the card', async () => {
    const rec = await page({ review: ARABIC, drop_cap: true });
    expect(lifted(rec)).toEqual([]);
    // The words are on the record, whole.
    expect(nodes(rec).some((n) => n.type === 'Text' && textOf(n).includes('الانتظار'))).toBe(true);
    rec.unmount();
    let card!: R;
    await act(async () => {
      card = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote: null, review: ARABIC, drop_cap: true, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    });
    expect(lifted(card)).toEqual([]);
    expect(nodes(card).some((n) => n.type === 'Text' && textOf(n).includes('الانتظار'))).toBe(true);
  });

  it('the card reads the review’s direction from the review: an English pull quote leaves an Arabic review Arabic', async () => {
    const card = (pull_quote: string, review: string) => render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote, review, drop_cap: true, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    let r!: R;
    await act(async () => { r = card('A masterpiece of silence', ARABIC); });
    expect(lifted(r)).toEqual([]); // no Arabic letter lifted out of its word
    expect(textsWith(r, 'الانتظار').length).toBeGreaterThan(0);
    expect(textsWith(r, 'الانتظار').every(rightToLeft)).toBe(true);
    expect(textsWith(r, 'A masterpiece of silence').map(rightToLeft)).toEqual([false]);
    r.unmount();
    // And the other way round: an Arabic quote does not set the English review hard right.
    await act(async () => { r = card(ARABIC, 'Every corridor is a held breath.'); });
    const english = textsWith(r, 'very corridor is a held breath.'); // the paragraph, and the words after its cap
    expect(english.length).toBeGreaterThan(0);
    expect(english.map(rightToLeft).every((x) => x === false)).toBe(true);
    expect(textsWith(r, ARABIC).map(rightToLeft)).toEqual([true]);
  });

  it('READ ON sits on the side the review reads from, whatever the pull quote', async () => {
    const LONG_EN = Array.from({ length: 40 }, () => 'Every corridor is a held breath.').join(' ');
    /** Where READ ON sits once the review has run past its lines: 'right' or 'left'. */
    const readOnSide = async (pull_quote: string, review: string) => {
      let r!: R;
      await act(async () => {
        r = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote, review, drop_cap: false, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
      });
      // Right-to-left words are laid out once by the phone, unseen; left-to-right ones are planned.
      const laidOut = nodes(r).filter((n) => typeof n.props.onTextLayout === 'function');
      for (const n of laidOut) await act(async () => { n.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 8 }, () => ({})) } }); });
      const rows = nodes(r).filter((n) => n.type === 'View' && textOf(n).startsWith('READ ON'));
      expect(rows).toHaveLength(1);
      const side = StyleSheet.flatten(rows[0]?.props.style)?.justifyContent === 'flex-end' ? 'right' : 'left';
      r.unmount();
      return side;
    };
    expect(await readOnSide('A masterpiece of silence', ARABIC)).toBe('right');
    expect(await readOnSide(ARABIC, LONG_EN)).toBe('left');
  });

  it('a right-to-left review that fits its lines says no READ ON', async () => {
    let r!: R;
    await act(async () => {
      r = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote: null, review: ARABIC, drop_cap: false, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    });
    const laidOut = nodes(r).filter((n) => typeof n.props.onTextLayout === 'function');
    const [measured] = laidOut;
    expect(laidOut).toHaveLength(1);
    await act(async () => { measured!.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } }); });
    expect(words(r)).not.toContain('READ ON');
    await act(async () => { measured!.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 6 }, () => ({})) } }); });
    expect(words(r)).toContain('READ ON');
  });
});

describe('a raised initial is a whole letter, on the card and on the record', () => {
  // ज़ with its dot is another letter than ज, and 👩‍💻 cut is a woman and a laptop.
  const ZA = String.fromCodePoint(0x091c, 0x093c);
  const CODER = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb);
  const caps = (r: R) => nodes(r).filter((n) => n.type === 'Text' && n.props.allowFontScaling === false).map(textOf);

  it.each([
    ['Hindi', `${ZA}${String.fromCodePoint(0x0930)} is the word.`, ZA],
    ['an emoji', `${CODER} built this.`, CODER],
    ['an opening quote', '"Wow," she said, and left.', '"W'], // the mark rides up; none of it is lost
  ])('%s: the card lifts all of the first letter, and the words go on from just after it', async (_, review, first) => {
    let card!: R;
    await act(async () => {
      card = render(<View><FrameWords item={{ id: 'l1', rating: 4, pull_quote: null, review, drop_cap: true, role: 'archivist', is_spoiler: false } as never} {...FRAME_WORDS} /></View>);
    });
    expect(caps(card)).toContain(first);
    // The frame sets its own lines: the first goes on from just after the letter.
    expect(words(card)).toContain(review.slice(first.length).trim());
    card.unmount();

    const rec = await page({ review, drop_cap: true });
    expect(caps(rec)).toContain(first);
  });
});

describe('the page draws only what it has', () => {
  it('a rating with no words draws no words at all, not an empty box', async () => {
    // The words are the paragraphs set in the page's essay face: present on a record with words
    // before they are absent on one without.
    const essays = (r: R) => nodes(r).filter((x) => x.type === 'Text' && StyleSheet.flatten(x.props.style)?.fontSize === 14
      && StyleSheet.flatten(x.props.style)?.lineHeight === 21).length;
    const withWords = await page();
    expect(essays(withWords)).toBe(1);
    withWords.unmount();
    const bare = await page({ review: '', pull_quote: null });
    expect(words(bare)).not.toContain('Every corridor');
    expect(essays(bare)).toBe(0);
  });
});

describe('the share card exists only while a share is in flight', () => {
  const card = (r: R) => r.queryByTestId('share-card');

  it('not on opening the page', async () => {
    const r = await page();
    expect(card(r)).toBeNull();
  });

  beforeEach(() => { mockCardReady = undefined; mockCaptureRef.mockClear(); });

  it('mounted for the share, captured only once it is whole, and gone when the share ends — however it ends', async () => {
    const r = await page();
    await act(async () => { await fireEvent.press(r.getByText('SHARE')); });
    // In flight: the card is up, and its pictures are not all drawn yet.
    expect(card(r)).not.toBeNull();
    await act(async () => { await new Promise((res) => setTimeout(res, 50)); });
    expect(mockCaptureRef).not.toHaveBeenCalled();
    expect(card(r)).not.toBeNull();
    // Whole: captured. The capture FAILS here — the case the card was once left
    // behind in. Success and failure leave by the same `finally`.
    await act(async () => { mockCardReady!(); await new Promise((res) => setTimeout(res, 50)); });
    expect(mockCaptureRef).toHaveBeenCalledTimes(1);
    expect(card(r)).toBeNull();
    expect(r.getByText('SHARE')).toBeTruthy();      // and the control is ready again
    expect(mockToastError).toHaveBeenCalledWith('The log could not be shared. Try again.');
  });

  it('a card that is never whole fails the share after 20 s, says so, and is gone', async () => {
    const r = await page();
    jest.useFakeTimers({ doNotFake: ['Date', 'performance', 'nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      await act(async () => { await fireEvent.press(r.getByText('SHARE')); });
      await act(async () => { jest.advanceTimersByTime(19_000); });
      expect(card(r)).not.toBeNull();
      expect(mockToastError).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(1_000); });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    expect(mockCaptureRef).not.toHaveBeenCalled();
    expect(card(r)).toBeNull();
    expect(mockToastError).toHaveBeenCalledWith('The log could not be shared. Try again.');
  });
});

describe('the record offers what the card offers', () => {
  it('a visitor can save the film, and take it back', async () => {
    const r = await page();
    await act(async () => { await fireEvent.press(r.getByLabelText('Save film to your watchlist')); });
    expect(r.getByLabelText('Save: on your watchlist. Takes it off')).toBeTruthy();
    // A second tap on the same control inside 400ms is swallowed on purpose
    // (PressableScale's debounce): a member's second tap comes later than that.
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    try {
      await act(async () => { await fireEvent.press(r.getByLabelText('Save: on your watchlist. Takes it off')); });
    } finally {
      clock.mockRestore();
    }
    expect(r.getByLabelText('Save film to your watchlist')).toBeTruthy();
  });
});

describe('a pull that reached nothing', () => {
  const pull = async (r: R) => {
    // The pull is the scroll view's own refreshControl, carried as a prop.
    const scroller = nodes(r).find((n) => typeof n.props?.refreshControl?.props?.onRefresh === 'function');
    await act(async () => { await scroller!.props.refreshControl.props.onRefresh(); });
  };

  it('keeps the record, and says so — it said nothing', async () => {
    const r = await page();
    mockQueryState = { status: 'error' };
    await pull(r);
    expect(mockToastError).toHaveBeenCalledWith('Could not refresh — check your connection.');
  });

  it('a pull that was answered says nothing', async () => {
    const r = await page();
    mockQueryState = { status: 'success' };
    await pull(r);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe('a record that could not be read', () => {
  const unread = async () => {
    const refetch = jest.fn();
    mockQuery = { data: undefined, isLoading: false, isError: true, refetch };
    let r!: R;
    await act(async () => { r = render(<LogDetailScreen />); });
    return { r, refetch };
  };

  it('says it could not be reached, never "Log not found", and asks again', async () => {
    const { r, refetch } = await unread();
    expect(r.queryByText('No Such Record')).toBeNull();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    await act(async () => { await fireEvent.press(r.getByLabelText('Try again')); });
    expect(refetch).toHaveBeenCalled();
  });

  it('and its way out says where it goes', async () => {
    mockCanGoBack = false;
    try {
      const { r } = await unread();
      expect(r.getByLabelText('Return to the Lobby')).toBeTruthy();
    } finally {
      mockCanGoBack = true;
    }
  });

  it('a record that is not there still says so, with its way out named', async () => {
    mockQuery = { data: { log: null, profile: null, comments: [], commentTotal: 0 }, isLoading: false, isError: false };
    let r!: R;
    await act(async () => { r = render(<LogDetailScreen />); });
    expect(r.getByText('No Such Record')).toBeTruthy();
    expect(r.getByText('Its member withdrew it, or it was never filed.')).toBeTruthy();
    expect(r.getByLabelText('Go back')).toBeTruthy();
  });
});

describe('a record opened from its card draws what the card held, at once (P4.53)', () => {
  const ROW = {
    id: LOG_ID, user_id: 'u1', username: 'morpho', avatar_url: null, role: 'archivist', film_title: 'In the Mood for Love', film_id: 843,
    poster_path: null, rating: 5, review: 'Every corridor is a held breath.', status: 'watched', created_at: '2026-08-12T21:00:00Z', year: 2000,
    critique_count: 3, certify_count: 12, certified: false,
  };
  /** What the page holds of a record, as far as these tests read it. */
  type Read = { log: { film_title: string }; profile: { username: string }; comments: unknown[]; commentTotal: number; critiquesUnread: boolean; seeded?: boolean };
  /** The page's own placeholder, asked as the query would ask it. */
  const seed = async () => {
    mockQuery = { data: undefined, isLoading: true };
    await act(async () => { render(<LogDetailScreen />); });
    return (mockOptions as unknown as { placeholderData: () => Read | undefined }).placeholderData();
  };

  it('seeds the page from the feed row it was opened from, its critiques still to come', async () => {
    mockFeeds = [[['feed', 'community'], { pages: [[{ ...ROW, id: '99999999-9999-4999-8999-999999999999' }], [ROW]] }], [['feed', 'stacks'], { pages: [[{ id: LOG_ID, title: 'a stack' }]] }]];
    const s = await seed();
    expect(s).toEqual(expect.objectContaining({ comments: [], commentTotal: 3, certifyCount: 12, certifiedKnown: true, critiquesUnread: false, seeded: true }));
    expect(s).toEqual(expect.objectContaining({
      log: expect.objectContaining({ id: LOG_ID, film_title: 'In the Mood for Love', review: 'Every corridor is a held breath.', user_id: 'u1' }),
      profile: expect.objectContaining({ username: 'morpho', role: 'archivist' }),
    }));
  });

  it('seeds nothing when no card holds the record', async () => {
    mockFeeds = [[['feed', 'community'], { pages: [[{ ...ROW, id: '99999999-9999-4999-8999-999999999999' }]] }]];
    expect(await seed()).toBeUndefined();
  });

  it('draws the seeded record, the count of its critiques, and never says there are none', async () => {
    mockFeeds = [[['feed', 'community'], { pages: [[ROW]] }]];
    const s = await seed();
    mockQuery = { data: s, isLoading: false };
    let r!: R;
    await act(async () => { r = render(<LogDetailScreen />); });
    const all = words(r);
    expect(all).toContain('Every corridor is a held breath.');
    expect(all).toContain('CRITIQUES · 3');
    expect(all).not.toContain('No critiques yet');
  });

  it('asks for the critiques with the record, not after it', async () => {
    await page();
    mockLogService.getLogDetails.mockReturnValue(new Promise(() => {}));
    mockLogService.getLogComments.mockResolvedValue({ comments: [], total: 0 });
    void mockOptions.queryFn({ signal: new AbortController().signal });
    await act(async () => {});
    // Asked while the record is still on its way.
    expect(mockLogService.getLogComments.mock.calls.map((c) => c[0])).toEqual([LOG_ID]);
  });

  it('keeps the card’s record when the house cannot be reached, its critiques said out of reach', async () => {
    mockFeeds = [[['feed', 'community'], { pages: [[ROW]] }]];
    await page();
    mockCache = undefined;
    mockLogService.getLogDetails.mockRejectedValue(new Error('Network request failed'));
    mockLogService.getLogComments.mockRejectedValue(new Error('Network request failed'));
    const read = await mockOptions.queryFn({ signal: new AbortController().signal });
    expect(read).toEqual(expect.objectContaining({ critiquesUnread: true, seeded: false, commentTotal: 3, log: expect.objectContaining({ film_title: 'In the Mood for Love' }) }));
  });
});
