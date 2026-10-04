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
 *   · the share card exists only while a share is in flight, and is gone after
 *     a failed one too;
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
import { ReviewContent } from '@/src/components/feed/ReviewContent';
import { s as recordStyles } from '@/src/components/log/logDetailStyles';

import LogDetailScreen from '../[id]';

const LOG_ID = '22222222-2222-4222-8222-222222222222';
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
    invalidateQueries: jest.fn(), cancelQueries: jest.fn(() => Promise.resolve()), removeQueries: jest.fn(),
  }),
}));
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
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
  enqueueMutation: jest.fn(), flushOfflineQueue: jest.fn(), getOfflineQueue: jest.fn(() => []),
}));
jest.mock('@/src/components/ShareToLoungeModal', () => () => null);
jest.mock('@/src/components/moderation/ReportSheet', () => () => null);
jest.mock('@/src/components/moderation/ContentActionSheet', () => ({ ContentActionSheet: () => null }));
// The card, drawn as a marker: what is under test is WHEN it exists.
jest.mock('@/src/components/film/LogShareCard', () => {
  const { View: V } = require('react-native');
  return () => <V testID="share-card" />;
});
jest.mock('@/src/services/LogService', () => ({
  LogService: { getLogDetails: jest.fn(), getLogComments: jest.fn(), addLogComment: jest.fn(), deleteLogComment: jest.fn() },
}));
const mockLogService = jest.requireMock('@/src/services/LogService').LogService as Record<string, jest.Mock>;

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
    const blocks = textsWith(r, ARABIC);
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) expect(rightToLeft(b)).toBe(true);
  });

  it('the card on the Reel sets it the same way', async () => {
    let r!: R;
    await act(async () => {
      r = render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote: ARABIC, review: ARABIC, drop_cap: false, role: 'archivist', is_spoiler: false } as never}
        isPremium isAuteur={false} onPress={() => {}} /></View>);
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
      card = render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote: null, review: '<p><The Batman> is the best of them</p>', drop_cap: false, role: 'archivist', is_spoiler: false } as never}
        isPremium isAuteur={false} onPress={() => {}} /></View>);
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
      card = render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote: null, review: ARABIC, drop_cap: true, role: 'archivist', is_spoiler: false } as never}
        isPremium isAuteur={false} onPress={() => {}} /></View>);
    });
    expect(lifted(card)).toEqual([]);
    expect(nodes(card).some((n) => n.type === 'Text' && textOf(n).includes('الانتظار'))).toBe(true);
  });

  it('the card reads the review’s direction from the review: an English pull quote leaves an Arabic review Arabic', async () => {
    const card = (pull_quote: string, review: string) => render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote, review, drop_cap: true, role: 'archivist', is_spoiler: false } as never}
      isPremium isAuteur={false} onPress={() => {}} /></View>);
    let r!: R;
    await act(async () => { r = card('A masterpiece of silence', ARABIC); });
    expect(lifted(r)).toEqual([]); // no Arabic letter lifted out of its word
    expect(textsWith(r, 'الانتظار').map(rightToLeft)).toEqual([true]);
    expect(textsWith(r, 'A masterpiece of silence').map(rightToLeft)).toEqual([false]);
    r.unmount();
    // And the other way round: an Arabic quote does not set the English review hard right.
    await act(async () => { r = card(ARABIC, 'Every corridor is a held breath.'); });
    const english = textsWith(r, 'very corridor is a held breath.'); // the paragraph, and the words after its cap
    expect(english.length).toBeGreaterThan(0);
    expect(english.map(rightToLeft).every((x) => x === false)).toBe(true);
    expect(textsWith(r, ARABIC).map(rightToLeft)).toEqual([true]);
  });

  it('“Read more” sits on the side the review reads from, whatever the pull quote', async () => {
    /** Where "Read more" sits once the review has filled its eight lines: 'right' or 'left'. */
    const readMoreSide = async (pull_quote: string, review: string) => {
      let r!: R;
      await act(async () => {
        r = render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote, review, drop_cap: false, role: 'archivist', is_spoiler: false } as never}
          isPremium isAuteur={false} onPress={() => {}} /></View>);
      });
      const laidOut = nodes(r).filter((n) => typeof n.props.onTextLayout === 'function');
      expect(laidOut).toHaveLength(1);
      await act(async () => { laidOut[0].props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 8 }, () => ({})) } }); });
      // The view that holds "Read more" and nothing else (the card around it holds the review too).
      const wraps = nodes(r).filter((n) => n.type === 'View' && textOf(n) === 'Read more');
      expect(wraps).toHaveLength(1);
      const wrap = wraps[0];
      const side = StyleSheet.flatten(wrap.props.style)?.alignItems === 'flex-end' ? 'right' : 'left';
      r.unmount();
      return side;
    };
    expect(await readMoreSide('A masterpiece of silence', ARABIC)).toBe('right');
    expect(await readMoreSide(ARABIC, 'Every corridor is a held breath.')).toBe('left');
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
      card = render(<View><ReviewContent item={{ id: 'l1', rating: 4, pull_quote: null, review, drop_cap: true, role: 'archivist', is_spoiler: false } as never}
        isPremium isAuteur={false} onPress={() => {}} /></View>);
    });
    expect(caps(card)).toContain(first);
    expect(words(card)).toContain(review);
    card.unmount();

    const rec = await page({ review, drop_cap: true });
    expect(caps(rec)).toContain(first);
  });
});

describe('the page draws only what it has', () => {
  it('a rating with no words draws no review section at all', async () => {
    // The section is the box styled `reviewSection` — found by its own style,
    // so the check is present on a record with words before it is absent on
    // one without.
    const section = StyleSheet.flatten(recordStyles.reviewSection);
    const sections = (r: R) => nodes(r).filter((x) => JSON.stringify(StyleSheet.flatten(x.props.style)) === JSON.stringify(section)).length;
    const withWords = await page();
    expect(sections(withWords)).toBe(1);
    withWords.unmount();
    const bare = await page({ review: '', pull_quote: null });
    // The words went, and so did the box that held them — not an empty frame.
    expect(words(bare)).not.toContain('Every corridor');
    expect(sections(bare)).toBe(0);
  });
});

describe('the share card exists only while a share is in flight', () => {
  const card = (r: R) => r.queryByTestId('share-card');

  it('not on opening the page', async () => {
    const r = await page();
    expect(card(r)).toBeNull();
  });

  it('mounted for the share, and gone when the share ends — however it ends', async () => {
    // The two frames the page waits for, before it draws the card to a picture,
    // are held here: that is the share in flight.
    const frames: FrameRequestCallback[] = [];
    const raf = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    try {
      const r = await page();
      await act(async () => { fireEvent.press(r.getByText('SHARE')); });
      expect(card(r)).not.toBeNull();
      // Let them run. A test renderer gives the card no native view to draw, so
      // this share FAILS — the case the card was once left behind in. Success
      // and failure leave by the same `finally`; it has to be gone either way.
      await act(async () => {
        for (let i = 0; i < 4 && frames.length; i++) { frames.shift()!(0); await new Promise((res) => setTimeout(res, 0)); }
        await new Promise((res) => setTimeout(res, 0));
      });
      expect(card(r)).toBeNull();
      expect(r.getByText('SHARE')).toBeTruthy();      // and the control is ready again
      expect(mockToastError).toHaveBeenCalledWith('The log could not be shared. Try again.');
    } finally {
      raf.mockRestore();
    }
  });
});

describe('the record offers what the card offers', () => {
  it('a visitor can save the film, and take it back', async () => {
    const r = await page();
    await act(async () => { fireEvent.press(r.getByLabelText('Save film to your watchlist')); });
    expect(r.getByLabelText('Remove film from your watchlist')).toBeTruthy();
    // A second tap on the same control inside 400ms is swallowed on purpose
    // (PressableScale's debounce): a member's second tap comes later than that.
    const now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 1000);
    try {
      await act(async () => { fireEvent.press(r.getByLabelText('Remove film from your watchlist')); });
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
    expect(r.queryByText('Log not found.')).toBeNull();
    expect(r.getByText('Transmission Interrupted')).toBeTruthy();
    await act(async () => { fireEvent.press(r.getByLabelText('Try again')); });
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
    expect(r.getByText('Log not found.')).toBeTruthy();
    expect(r.getByLabelText('Go back')).toBeTruthy();
  });
});
