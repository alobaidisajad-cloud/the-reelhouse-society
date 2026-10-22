/**
 * labFrameLog.test.tsx — the speed lab's frame record counts what it says, and says nothing of a
 * quiet second: a JavaScript task is long only past a frame and 50 ms, a UI frame slow only past
 * 25 ms, and each page's count starts at that page (LabFrameLog.tsx).
 */
import { render, act } from '@testing-library/react-native';
import { useFrameCallback } from 'react-native-reanimated';
import { usePathname } from 'expo-router';
import { e2eTrace } from '@/src/utils/e2eTrace';
import { LabFrameLog } from '../LabFrameLog';

jest.mock('@/src/utils/e2eTrace', () => ({ e2eTrace: jest.fn(), E2E_BUILD: true, LAB_BUILD: true }));

type Frame = { timeSincePreviousFrame: number | null };
let frames: ((now: number) => void)[] = [];

beforeEach(() => {
  jest.useFakeTimers();
  frames = [];
  jest.mocked(e2eTrace).mockClear();
  jest.mocked(useFrameCallback).mockClear();
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb as (now: number) => void); return frames.length; });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

/** The JS thread reaches its next animation frame at `at` ms. */
const jsFrame = (at: number) => { const next = frames.shift(); next?.(at); };
/** The UI thread draws a frame `gap` ms after its last. */
const uiFrame = (gap: number) => {
  const worklet = jest.mocked(useFrameCallback).mock.calls.at(-1)?.[0] as (f: Frame) => void;
  worklet({ timeSincePreviousFrame: gap });
};
const lines = () => jest.mocked(e2eTrace).mock.calls.filter(([event]) => event === 'lab.frames').map(([, detail]) => detail);

it('counts a JavaScript task past a frame and 50 ms, and the UI frames over 25 ms, for the page open', async () => {
  jest.mocked(usePathname).mockReturnValue('/reels');
  render(<LabFrameLog />);
  jsFrame(1000);
  jsFrame(1017); // on time
  jsFrame(1079); // 45 ms past its frame: not past 50 ms
  jsFrame(1179); // 83 ms past its frame: a long task
  uiFrame(16);
  uiFrame(30);
  uiFrame(120);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lines()).toEqual([{ path: '/reels', js: { long: 1, longest: 83 }, ui: { frames: 3, slow: 2, worst: 120 } }]);
});

it('says nothing of a quiet second, and counts the next page from its own start', async () => {
  jest.mocked(usePathname).mockReturnValue('/reels');
  const page = render(<LabFrameLog />);
  uiFrame(16);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lines()).toEqual([]);

  jest.mocked(usePathname).mockReturnValue('/dispatch');
  page.rerender(<LabFrameLog />);
  uiFrame(40);
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(lines()).toEqual([{ path: '/dispatch', js: { long: 0, longest: 0 }, ui: { frames: 1, slow: 1, worst: 40 } }]);
});
