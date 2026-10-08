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
import { ShareCardModal } from '../ShareCardModal';

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
    await act(async () => { fireEvent.press(r2.getByText('SHARE TO SOCIALS')); });
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });

  it('a pressed button that is still developing captures nothing', async () => {
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    await act(async () => { fireEvent.press(r.getByText('DEVELOPING...')); });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('a poster that fails leaves a file that can still be shared, without the hole', async () => {
    const r = render(<ShareCardModal visible onClose={jest.fn()} film={FILM} log={null} username="morpho" memberNo={12} />);
    await act(async () => { seal(r)[0].props.onDisplay!(); posters(r, POSTER)[0].props.onError!(); });
    expect(posters(r, POSTER)).toHaveLength(0);
    expect(r.getByText('SHARE TO SOCIALS')).toBeTruthy();
  });
});
