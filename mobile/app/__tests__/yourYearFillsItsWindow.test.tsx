/**
 * Year in Cinema: each slide fills the window it is given, stays on its page when the window's
 * width changes, and counts one film in the singular (round 14).
 *
 * The slides were the window less both insets, laid from the top: on a phone with a notch and a
 * home indicator their ground stopped in a hard edge 93pt above the foot, and the paginator
 * floated. A foldable unfolded mid-story left the pager between pages, on a slide not drawn: no
 * paging scroll moves its offset for a layout change.
 */
import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
import YearInCinemaScreen from '../year-in-cinema';
import { useAuthStore } from '@/src/stores/auth';
import type { YearLogInput } from '@/src/services/YearInCinemaService';

jest.mock('@/src/services/YearInCinemaService', () => ({
  ...jest.requireActual('@/src/services/YearInCinemaService'),
  fetchYearLogs: jest.fn(),
}));
const { fetchYearLogs } = jest.requireMock('@/src/services/YearInCinemaService') as { fetchYearLogs: jest.Mock };

// An iPhone 15: a 59pt status bar and a 34pt home indicator.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const insets = { top: 59, bottom: 34, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 393, height: 852 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaInsetsContext: React.createContext(insets),
    SafeAreaFrameContext: React.createContext(frame),
    initialWindowMetrics: { insets, frame },
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
  };
});

/** The window, as the phone says it: a foldable's column changes width while the story is open. */
let mockWindow = { width: 384, height: 852, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

const log = (watchedDate: string, n: number): YearLogInput =>
  ({ id: n, title: `Film ${n}`, poster: null, rating: 4, watchedDate, createdAt: watchedDate });

const realNow = Date.now.bind(Date);
beforeEach(() => {
  const from = realNow();
  jest.spyOn(Date, 'now').mockImplementation(() => new Date('2026-06-01T12:00:00').getTime() + (realNow() - from));
  mockWindow = { width: 384, height: 852, scale: 3, fontScale: 1 };
  fetchYearLogs.mockReset();
  useAuthStore.setState({ user: { id: 'me', username: 'member' } as never });
});
afterEach(() => jest.restoreAllMocks());

const pagerOf = (r: Awaited<ReturnType<typeof render>>) => r.getByTestId('year-pager');
type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };
/** Every drawn view under the root whose own style passes `test`. */
const viewsOf = (r: Awaited<ReturnType<typeof render>>, test: (style: Record<string, unknown>) => boolean): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node | string | null) => {
    if (!n || typeof n === 'string') return;
    if (test((StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>)) out.push(n);
    n.children?.forEach(walk);
  };
  [r.toJSON() as unknown as Node | Node[]].flat().forEach(walk);
  return out;
};
/** The slide views: the pager's own pages, each set at the pager's width and a height. */
const slidesOf = (r: Awaited<ReturnType<typeof render>>) =>
  viewsOf(r, (st) => st.flex === 1 && st.width === mockWindow.width && st.height !== undefined);
const swipeTo = async (r: Awaited<ReturnType<typeof render>>, index: number) => {
  await act(async () => {
    await fireEvent(pagerOf(r), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: index * mockWindow.width, y: 0 } } });
  });
};

it('one film in the year is "Film Logged", not "Films Logged"', async () => {
  fetchYearLogs.mockResolvedValue([log('2026-03-04', 1)]);
  const r = await render(<YearInCinemaScreen />);
  await r.findByText('2026');
  await swipeTo(r, 1);
  expect(await r.findByText('Film Logged')).toBeTruthy();
  expect(r.queryByText('Films Logged')).toBeNull();
});

it('two films are "Films Logged"', async () => {
  fetchYearLogs.mockResolvedValue([log('2026-03-04', 1), log('2026-04-04', 2)]);
  const r = await render(<YearInCinemaScreen />);
  await r.findByText('2026');
  await swipeTo(r, 1);
  expect(await r.findByText('Films Logged')).toBeTruthy();
});

it('each slide is the whole height the pager is laid at, its words below the status bar', async () => {
  fetchYearLogs.mockResolvedValue([log('2026-03-04', 1)]);
  const r = await render(<YearInCinemaScreen />);
  await r.findByText('2026');
  // The pager as the phone lays it: the whole window.
  await act(async () => { await fireEvent(pagerOf(r), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 384, height: 852 } } }); });
  const slides = slidesOf(r);
  expect(slides.length).toBeGreaterThan(1);
  for (const slide of slides) {
    const style = (StyleSheet.flatten(slide.props.style as never) ?? {}) as Record<string, unknown>;
    // never the window less both insets (852 - 59 - 34 = 759)
    expect(style.height).toBe(852);
    expect(style.paddingTop).toBe(59);
  }
  // The footer clears the home indicator once: its edge and its gap, not the inset twice.
  expect(viewsOf(r, (st) => st.paddingBottom === 34 + 16).length).toBe(1);
});

it('a window that changes width puts the pager back on the slide it was on', async () => {
  fetchYearLogs.mockResolvedValue([log('2026-03-04', 1), log('2026-04-04', 2)]);
  const r = await render(<YearInCinemaScreen />);
  await r.findByText('2026');
  await swipeTo(r, 2);
  const scrollTo = jest.spyOn(ScrollView.prototype as unknown as { scrollTo: (o: unknown) => void }, 'scrollTo');
  // Unfolded: the column goes from 384 to 560, and the pages are laid again at 560.
  mockWindow = { ...mockWindow, width: 560 };
  await act(async () => { r.rerender(<YearInCinemaScreen />); });
  await act(async () => { await fireEvent(pagerOf(r), 'contentSizeChange', 560 * 5, 852); });
  expect(scrollTo).toHaveBeenLastCalledWith({ x: 2 * 560, animated: false });
});
