/**
 * theThumbStaysInItsTrack.test.ts — a scrollbar that ran backwards.
 * ─────────────────────────────────────────────────────────────────────────────
 * `CinematicScrollbar` gives its thumb a 36pt floor so it stays grabbable on a
 * very long list. It had no matching ceiling.
 *
 * On a SHORT track — a small scrolling area with large insets, where
 * `viewHeight - topInset - bottomInset` lands between 1 and 35 — the floor made
 * the thumb TALLER than the track it runs in. `trackHeight - baseHeight` then
 * went negative, and the thumb drifted UPWARD out of its own track as the
 * member scrolled downward.
 *
 * The guard above it only refuses `trackHeight <= 0`, so every height from 1 to
 * 35 went through.
 *
 * ── WHY THIS TESTS THE MATHS AND NOT THE COMPONENT ──────────────────────────
 * The two layers are `useDerivedValue`/`useAnimatedStyle` worklets, which need
 * reanimated's UI runtime to evaluate. The thing that must never regress is
 * arithmetic: the thumb's height never exceeds the track, and its travel is
 * never negative. That is what is pinned, at every track height the guard lets
 * through, plus the ordinary ones.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The geometry layer's height, and the motion layer's travel — as written. */
const baseHeightOf = (trackHeight: number, scrollHeight: number) => {
  const heightRatio = trackHeight / scrollHeight;
  return Math.min(Math.max(heightRatio * trackHeight, 36), trackHeight);
};
const travelOf = (trackHeight: number, scrollHeight: number) =>
  Math.max(trackHeight - baseHeightOf(trackHeight, scrollHeight), 0);

/** Every track height the `trackHeight <= 0` guard allows through, and then some. */
const TRACKS = [1, 2, 5, 10, 20, 35, 36, 37, 50, 120, 400, 800, 1200];
const CONTENT = [50, 100, 500, 2000, 25000];

describe('the scrollbar thumb stays inside its own track', () => {
  it('is never taller than the track, at any height the guard lets through', () => {
    const overflowing: string[] = [];
    for (const t of TRACKS) {
      for (const s of CONTENT) {
        if (s <= t) continue; // the scrollbar hides itself when there is nothing to scroll
        const h = baseHeightOf(t, s);
        if (h > t) overflowing.push(`track=${t} content=${s} thumb=${h}`);
      }
    }
    expect(overflowing).toEqual([]);
  });

  it('never travels BACKWARDS — the defect, exactly', () => {
    const backwards: string[] = [];
    for (const t of TRACKS) {
      for (const s of CONTENT) {
        if (s <= t) continue;
        if (travelOf(t, s) < 0) backwards.push(`track=${t} content=${s}`);
      }
    }
    expect(backwards).toEqual([]);
  });

  it('the 36pt floor still applies on a long list — the clamp did not undo it', () => {
    // A tall track with a great deal of content: the proportional height would
    // be tiny, and the floor is what keeps the thumb visible.
    expect(baseHeightOf(800, 25000)).toBe(36);
  });

  it('a short track pins the thumb to the track, with no travel', () => {
    // 36 would not fit, so the thumb becomes the track and simply does not move.
    // Better a still thumb than one climbing out of its own rail.
    expect(baseHeightOf(20, 2000)).toBe(20);
    expect(travelOf(20, 2000)).toBe(0);
  });

  it('the UNCLAMPED form really did go backwards — this is not a hypothetical', () => {
    // What the code computed before: no ceiling, no floor on the travel.
    const oldBase = (t: number, s: number) => Math.max((t / s) * t, 36);
    const oldTravel = (t: number, s: number) => t - oldBase(t, s);
    expect(oldBase(20, 2000)).toBe(36);   // taller than its 20pt track
    expect(oldTravel(20, 2000)).toBe(-16); // and travelling upward
  });
});

/**
 * ── AND THE COMPONENT HAS TO BE DOING THE SAME ARITHMETIC ───────────────────
 * Everything above is a COPY of the maths. On its own it would stay green while
 * somebody deleted the clamp from the component — a guard that cannot fail,
 * which is the trap this project has already been caught by. These read the
 * source and require the two expressions to actually be there.
 *
 * The worklets cannot be imported and run without reanimated's UI runtime, so
 * the source is the honest thing to check.
 */
describe('the component itself carries both clamps', () => {
  const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'CinematicScrollbar.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('clamps the thumb height to the track in BOTH layers', () => {
    // Geometry sets the height, motion positions it. If only one carries the
    // ceiling, the thumb is drawn at one size and moved as though another.
    const clamps = SRC.match(
      /Math\.min\(Math\.max\(heightRatio \* trackHeight, 36\), trackHeight\)/g,
    ) ?? [];
    expect(clamps).toHaveLength(2);
  });

  it('floors the travel at zero, so it can never run backwards', () => {
    expect(SRC).toMatch(/Math\.max\(trackHeight - baseHeight, 0\)/);
  });

  it('reads a real file — not passing on an empty read', () => {
    expect(SRC.length).toBeGreaterThan(1500);
    expect(SRC).toContain('heightRatio');
  });
});
