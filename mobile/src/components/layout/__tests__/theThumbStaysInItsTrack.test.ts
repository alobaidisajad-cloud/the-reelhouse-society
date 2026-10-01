/**
 * theThumbStaysInItsTrack.test.ts — the scrollbar's thumb, on every track.
 * ─────────────────────────────────────────────────────────────────────────────
 * The thumb has a 36pt floor so it stays grabbable on a long list. On a SHORT
 * track (a small scrolling area with large insets, 1 to 35pt) that floor made
 * it taller than its track, its travel went negative, and it climbed UP out of
 * its rail as the member scrolled down. The maths is the component's own
 * (`thumbHeight`, `thumbTravel`), run here at every track height there is.
 */
import { MOBILE, readCode } from '@/test-utils/readCode';
import { thumbHeight, thumbTravel } from '../CinematicScrollbar';

/** Every track height the `trackHeight <= 0` guard allows through, and then some. */
const TRACKS = [1, 2, 5, 10, 20, 35, 36, 37, 50, 120, 400, 800, 1200];
const CONTENT = [50, 100, 500, 2000, 25000];
/** The scrollbar hides itself when there is nothing to scroll. */
const scrollable = () => TRACKS.flatMap((t) => CONTENT.filter((s) => s > t).map((s) => [t, s] as const));

describe('the scrollbar thumb stays inside its own track', () => {
  it('is never taller than the track, at any height the guard lets through', () => {
    expect(scrollable().filter(([t, s]) => thumbHeight(t, s) > t)).toEqual([]);
  });

  it('never travels BACKWARDS — the defect, exactly', () => {
    expect(scrollable().filter(([t, s]) => thumbTravel(t, s) < 0)).toEqual([]);
  });

  it('keeps its 36pt floor on a long list', () => {
    expect(thumbHeight(800, 25000)).toBe(36);
  });

  it('on a short track becomes the track, and stands still', () => {
    expect(thumbHeight(20, 2000)).toBe(20);
    expect(thumbTravel(20, 2000)).toBe(0);
  });
});

describe('both of the component\'s layers use that maths', () => {
  // The layers are worklets that need reanimated's UI runtime, so the call sites are read.
  const SRC = readCode(`${MOBILE}/src/components/layout/CinematicScrollbar.tsx`);

  it('sizes the thumb with thumbHeight in both layers, and moves it with thumbTravel', () => {
    expect(SRC.match(/thumbHeight\(trackHeight, scrollHeight\.value\)/g) ?? []).toHaveLength(2);
    expect(SRC).toMatch(/thumbTravel\(trackHeight, scrollHeight\.value\)/);
  });
});
