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
jest.mock('@tanstack/react-query', () => ({
  QueryClient: class { defaultOptions = {}; getQueryCache = () => ({ subscribe: () => () => {} }); },
  useQueryClient: () => ({
    setQueryData: jest.fn(), getQueryData: jest.fn(), removeQueries: jest.fn(),
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
jest.mock('@/src/services/StackService', () => ({
  StackService: { getStackFullPayload: jest.fn(), getStackComments: jest.fn() },
}));
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn(), addBreadcrumb: jest.fn() }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { poster: (p: string, size: string) => `https://img/${size}${p}` } }));
jest.mock('@/src/components/layout/CinematicFlashList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { CinematicFlashList: ({ ListHeaderComponent }: { ListHeaderComponent?: React.ReactNode }) =>
    React.createElement(View, null, typeof ListHeaderComponent === 'function'
      ? React.createElement(ListHeaderComponent as never) : ListHeaderComponent) };
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

beforeEach(() => { jest.clearAllMocks(); });

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
    for (const gone of ['commentsPanel', 'commentInputRow', 'commentInput:', 'commentSendBtn']) {
      expect(SOURCE).not.toContain(gone);
    }
  });
});
