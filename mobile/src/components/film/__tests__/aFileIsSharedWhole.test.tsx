/**
 * aFileIsSharedWhole.test.tsx — THE NITRATE FILE leaves the app with every
 * picture on it.
 *
 * The film page shared the file two seconds after it opened, poster or not, and
 * the log page captured its card two frames after mounting it, while the card
 * was still loading its own two copies of the poster: either could send a file
 * with a hole where the poster goes. Now the card says when every picture on it
 * is drawn (expo-image's onDisplay), and nothing is captured before that. A
 * poster that fails turns the card to its no-poster face. And a file with no
 * member's serial names the house, not another company's address.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { NitrateFileCard, type NitrateFileData } from '../NitrateFileCard';
import { previewScaleFor, ShareCardModal } from '../ShareCardModal';
import { NITRATE_CARD_HEIGHT, NITRATE_CARD_WIDTH } from '../NitrateFileCard';
import { overlayRoomEdge } from '@/src/components/layout/navMetrics';
import { Dimensions, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const mockCapture = jest.fn();
jest.mock('react-native-view-shot', () => {
  const R = require('react');
  return {
    __esModule: true,
    default: R.forwardRef(({ children }: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ capture: () => mockCapture() }));
      return children;
    }),
  };
});
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...a: unknown[]) => mockShareAsync(...a) }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

type R = ReturnType<typeof render>;
type Img = { type: string; props: { source: { uri?: string; testUri?: string } | number; onDisplay?: () => void; onError?: () => void }; children?: unknown[] };
/** Every expo-image picture in the tree, as drawn now (the mock is a host element, `ExpoImage`). */
const images = (r: R): Img[] => {
  const out: Img[] = [];
  const go = (j: unknown) => {
    if (!j || typeof j !== 'object') return;
    if (Array.isArray(j)) { j.forEach(go); return; }
    const n = j as Img;
    if (n.type === 'ExpoImage') out.push(n);
    (n.children ?? []).forEach(go);
  };
  go(r.toJSON());
  return out;
};
const posters = (r: R, uri: string) => images(r).filter((i) => typeof i.props.source === 'object' && i.props.source.uri === uri);
// The seal is the app's own picture (a bundled asset; the test renderer gives it a testUri).
const seal = (r: R) => images(r).filter((i) => typeof i.props.source === 'object' && /reelhouse-logo.png$/.test(String((i.props.source as { testUri?: string }).testUri)));

const POSTER = 'https://image.tmdb.org/t/p/w500/odyssey.jpg';
const DATA: NitrateFileData = {
  title: 'The Odyssey', year: '2026', posterUrl: POSTER, rating: 4, review: null,
  pullQuote: null, status: 'watched', username: 'morpho', memberNo: 12,
};

describe('the card says when it is whole', () => {
  it('only once the seal and both copies of the poster are drawn', async () => {
    const onReady = jest.fn();
    const r = render(<NitrateFileCard data={DATA} onReady={onReady} />);
    expect(posters(r, POSTER)).toHaveLength(2);
    expect(seal(r)).toHaveLength(1);

    await act(async () => { seal(r)[0].props.onDisplay!(); });
    await act(async () => { posters(r, POSTER)[0].props.onDisplay!(); });
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => { posters(r, POSTER)[1].props.onDisplay!(); });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a poster that fails turns the card to its no-poster face, which is whole at once', async () => {
    const onReady = jest.fn();
    const r = render(<NitrateFileCard data={DATA} onReady={onReady} />);
    await act(async () => { seal(r)[0].props.onDisplay!(); });
    await act(async () => { posters(r, POSTER)[0].props.onError!(); });
    expect(posters(r, POSTER)).toHaveLength(0);
    // The no-poster face carries the title in the frame, as well as below it.
    expect(r.getAllByText('The Odyssey')).toHaveLength(2);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a file with no poster waits only for its seal', async () => {
    const onReady = jest.fn();
    const r = render(<NitrateFileCard data={{ ...DATA, posterUrl: null }} onReady={onReady} />);
    expect(onReady).not.toHaveBeenCalled();
    await act(async () => { seal(r)[0].props.onDisplay!(); });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a new poster is waited for again', async () => {
    const onReady = jest.fn();
    const r = render(<NitrateFileCard data={{ ...DATA, posterUrl: null }} onReady={onReady} />);
    await act(async () => { seal(r)[0].props.onDisplay!(); });
    expect(onReady).toHaveBeenCalledTimes(1);
    r.rerender(<NitrateFileCard data={DATA} onReady={onReady} />);
    await act(async () => { posters(r, POSTER).forEach((p) => p.props.onDisplay!()); });
    expect(onReady).toHaveBeenCalledTimes(2);
  });
});

describe('the ledger line', () => {
  it('carries the member’s serial when it reached the app', async () => {
    const r = render(<NitrateFileCard data={DATA} />);
    expect(r.getByText('MEMBER Nº 0012')).toBeTruthy();
  });

  it('without one, names the house — never another company’s address', async () => {
    const r = render(<NitrateFileCard data={{ ...DATA, memberNo: null }} />);
    expect(r.getByText('THEREELHOUSESOCIETY.COM')).toBeTruthy();
    expect(JSON.stringify(r.toJSON())).not.toMatch(/reelhouse\.app/i);
  });

  // The house's address beside an eleven-letter handle ran the handle out of the line (largest-text
  // run 41237565336). A handle is the member's name on a card that leaves the app: never cut. The
  // ledger wraps rather than squeeze it, and the widest handle the rules allow fits a line of its own.
  it('keeps the member’s handle whole: it takes a line of its own before it is cut', async () => {
    const { lineWidth } = require('@/src/components/lobby/measure') as typeof import('@/src/components/lobby/measure');
    const { ELITE, ELITE_WIDEST } = require('@/src/theme/faceAdvances') as typeof import('@/src/theme/faceAdvances');
    const widestLetter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'].sort((a, b) => (ELITE[b] ?? ELITE_WIDEST) - (ELITE[a] ?? ELITE_WIDEST))[0]!;
    const widest = `@${widestLetter.repeat(30)}`;
    const r = render(<NitrateFileCard data={{ ...DATA, memberNo: null, username: widestLetter.repeat(30) }} />);
    const handle = r.getByText(widest);
    const look = StyleSheet.flatten(handle.props.style) as { fontSize: number; letterSpacing: number; flexShrink?: number };
    // The name's own row (the name and its rank mark), then the ledger: the first row above it
    // with the slab's padding. Both wrap, so the mark goes under the name before the name is cut.
    const flat = (b: typeof handle.parent) => (StyleSheet.flatten(b?.props.style) ?? {}) as { flexDirection?: string; flexWrap?: string; paddingHorizontal?: number };
    let group = handle.parent;
    while (group && flat(group).flexDirection !== 'row') group = group.parent;
    let box = group;
    while (box && !(flat(box).flexDirection === 'row' && flat(box).paddingHorizontal != null)) box = box.parent;
    const ledger = flat(box) as { flexWrap?: string; paddingHorizontal: number };
    // The ledger's line: the slab (32 from the left, 16 from the right, a border of 1 each side), less its padding.
    const line = NITRATE_CARD_WIDTH - 32 - 16 - 2 - 2 * ledger.paddingHorizontal;
    expect(lineWidth(widest, 'elite', look.fontSize, 1, look.letterSpacing)).toBeLessThanOrEqual(line);
    expect([ledger.flexWrap, flat(group).flexWrap, look.flexShrink ?? 0]).toEqual(['wrap', 'wrap', 0]);
  });
});

describe("the film page's file is shared only whole", () => {
  const FILM = { id: 1, title: 'The Odyssey', poster_path: '/odyssey.jpg' };
  beforeEach(() => { mockCapture.mockReset(); mockShareAsync.mockReset(); });

  it('develops until every picture is drawn — however long that takes — then shares', async () => {
    jest.useFakeTimers({ doNotFake: ['Date', 'performance'] });
    try {
      const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
      await act(async () => { jest.advanceTimersByTime(10_000); });
      // The old fallback shared after 2 s, poster or not.
      expect(r.getByText('DEVELOPING...')).toBeTruthy();
      await act(async () => { seal(r)[0].props.onDisplay!(); posters(r, POSTER).forEach((p) => p.props.onDisplay!()); });
      expect(r.getByText('SHARE TO SOCIALS')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
    mockCapture.mockResolvedValue('file:///card.png');
    mockShareAsync.mockResolvedValue(undefined);
    const r2 = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    await act(async () => { seal(r2)[0].props.onDisplay!(); posters(r2, POSTER).forEach((p) => p.props.onDisplay!()); });
    await act(async () => { await fireEvent.press(r2.getByText('SHARE TO SOCIALS')); });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('a pressed button that is still developing captures nothing', async () => {
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    await act(async () => { await fireEvent.press(r.getByText('DEVELOPING...')); });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('a poster that fails leaves a file that can still be shared, without the hole', async () => {
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    await act(async () => { seal(r)[0].props.onDisplay!(); posters(r, POSTER)[0].props.onError!(); });
    expect(posters(r, POSTER)).toHaveLength(0);
    expect(r.getByText('SHARE TO SOCIALS')).toBeTruthy();
  });
});

describe('the preview fills the room the card stands in, and no more', () => {
  it('on a 390 × 844 phone at a 59pt inset, a card with a 143pt frame stands in the room exactly', () => {
    const room = overlayRoomEdge({ top: 59, bottom: 34 });
    const preview = NITRATE_CARD_HEIGHT * previewScaleFor(390, 844, room, 143);
    expect(Math.abs(preview + 143 + 2 * room - 844)).toBeLessThan(0.01);
    // The old budget, the window less 240, was 2pt taller than this room.
    expect(NITRATE_CARD_HEIGHT * Math.min(1, 318 / 360, (844 - 240) / NITRATE_CARD_HEIGHT) + 143 + 2 * room).toBeGreaterThan(845);
  });

  it('measures the card’s own frame once drawn, and gives the preview the rest of the room', async () => {
    // A 390 × 844 phone, where the room's height, not its width, sizes the preview once the frame is tall.
    const [width, height] = [390, 844];
    const window = jest.spyOn(Dimensions, 'get');
    const before = window.getMockImplementation();
    window.mockImplementation(() => ({ width, height, scale: 3, fontScale: 1 }));
    try {
    const room = overlayRoomEdge(useSafeAreaInsets());
    const FILM = { id: 1, title: 'The Odyssey', poster_path: '/odyssey.jpg' };
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    const sheet = r.getByTestId('nitrate-file-sheet');
    const previewHeight = () => StyleSheet.flatten(r.getByTestId('nitrate-file-preview').props.style).height as number;
    const lay = (h: number) => act(async () => { await fireEvent(sheet, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: h } } }); });
    // Drawn, the frame turns out to be 300: the preview is sized to the room less that.
    await lay(previewHeight() + 300);
    expect(previewHeight()).toBeCloseTo(NITRATE_CARD_HEIGHT * previewScaleFor(width, height, room, 300), 5);
    expect(previewHeight() + 300 + 2 * room).toBeCloseTo(height, 5);
    // Measured again as drawn now, it stays: no second correction.
    const settled = previewHeight();
    await lay(settled + 300);
    expect(previewHeight()).toBe(settled);
    } finally {
      window.mockImplementation(before!);
    }
  });
});
