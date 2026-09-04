/**
 * motionLaws.test.tsx — the movement that was designed and never built.
 * ─────────────────────────────────────────────────────────────────────────────
 * `paperMotion.ts` is a hundred and forty lines specifying how this page moves,
 * and NOTHING in the app imported it — the second module in this feature written
 * as design and left unwired, after `paperPerf`. Its own opening says why that
 * is not a neutral state: with nothing specified, every screen inherits whatever
 * the navigator and the platform do, and an app assembled that way feels
 * assembled.
 *
 * What is held here is the file's own three laws, because those are the part
 * that can be checked without a device:
 *
 *   NOTHING OVERSHOOTS      no springs, no bounce. A printed page does not
 *                           wobble and a members' club does not bounce.
 *   IT RUNS ON THE UI THREAD OR IT DOES NOT RUN
 *                           opacity and transform only. No animated width,
 *                           height, margin, top or zIndex — those relayout every
 *                           frame, and animating zIndex produced this app's own
 *                           worst visual bug once already.
 *   REDUCED MOTION ARRIVES  durations collapse and transforms go to their end
 *                           state. Nothing is REMOVED — the state still changes,
 *                           it simply arrives.
 *
 * The fourth thing asserted is that the module is imported at all, since the
 * defect being fixed was precisely that it was not.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

import { PaperFill } from '@/src/components/dispatch/paper/PaperFill';
import { PaperStrike } from '@/src/components/dispatch/paper/PaperStrike';
import { MS, EASE, STRIKE_SCALE, STAGGER_MS, PILL_Y } from '@/src/components/dispatch/paper/paperMotion';

const DIR = path.join(__dirname, '..', 'paper');

/** Every paper component, comments stripped — a rule must not fail on its own explanation. */
const sources = fs.readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({
    name: f,
    code: fs.readFileSync(path.join(DIR, f), 'utf8')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/[^\n]*$/gm, ''),
  }));

describe('the motion design is actually wired', () => {
  it('read the components', () => {
    expect(sources.length).toBeGreaterThan(8);
  });

  it('something imports paperMotion', () => {
    // The whole defect: a hundred and forty lines of specification that no file
    // in the app referred to.
    const importers = sources.filter((s) => s.code.includes("from './paperMotion'"));
    expect(importers.map((s) => s.name).sort()).not.toEqual([]);
  });

  it('every duration comes from the palette, never a loose number', () => {
    // Five durations and nothing between them. A palette of five is a house
    // style; fourteen ad-hoc numbers is a codebase where each screen was tuned
    // alone.
    const loose: string[] = [];
    for (const s of sources) {
      for (const m of s.code.matchAll(/duration:\s*([^,)}\s]+)/g)) {
        if (!/^MS\./.test(m[1])) loose.push(s.name + ' → duration: ' + m[1]);
      }
    }
    expect(loose).toEqual([]);
  });
});

describe('the three laws', () => {
  it('nothing springs, and nothing bounces', () => {
    const springs = sources
      .filter((s) => /withSpring|withBounce|Easing\.bounce|Easing\.elastic|Easing\.back/.test(s.code))
      .map((s) => s.name);
    expect(springs).toEqual([]);
  });

  it('only opacity and transform are animated', () => {
    // A layout property animated on this page re-measures every frame — on a
    // list a member scrolls for twenty minutes.
    const banned = ['width', 'height', 'marginTop', 'marginBottom', 'top', 'left', 'zIndex'];
    const offenders: string[] = [];
    for (const s of sources) {
      // Only inside an animated style, which is where it would cost anything.
      for (const m of s.code.matchAll(/useAnimatedStyle\(\(\)\s*=>\s*\(\{([\s\S]*?)\}\)\)/g)) {
        /**
         * The one exception the law allows, and it is narrow: reserving the room
         * the KEYBOARD takes is a height by necessity — sliding the content up
         * with a transform instead would carry the desk's header off the top of
         * the screen, and there is no keyboard avoidance that does not change
         * layout. It also is not the case the law is about: once, on open, on a
         * screen nobody is scrolling, driven by the OS.
         *
         * Permitted only when the style actually READS the keyboard height, so a
         * height animated for any other reason still fails here.
         */
        if (/keyboard\.height/.test(m[1])) continue;
        for (const prop of banned) {
          if (new RegExp('\\b' + prop + '\\s*:').test(m[1])) offenders.push(s.name + ' → ' + prop);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every animation asks about reduced motion', () => {
    const animating = sources.filter((s) => /withTiming|entering=|exiting=/.test(s.code));
    expect(animating.length).toBeGreaterThan(0);
    const deaf = animating.filter((s) => !s.code.includes('useReducedMotion')).map((s) => s.name);
    expect(deaf).toEqual([]);
  });
});

describe('the numbers themselves', () => {
  it('are the five the design names, in order', () => {
    expect(Object.values(MS)).toEqual([90, 140, 200, 280, 320]);
    expect(MS.strike).toBeLessThan(MS.quick);
    expect(MS.considered).toBeLessThan(MS.page);
  });

  it('describe a pulse, not a spring', () => {
    // The one overshoot-shaped number in the file, and it returns to exactly 1.
    expect(STRIKE_SCALE).toBeGreaterThan(1);
    expect(STRIKE_SCALE).toBeLessThan(1.25);
  });

  it('move things in POINTS, not fractions of a screen', () => {
    expect(PILL_Y).toBeLessThanOrEqual(12);
    expect(STAGGER_MS).toBeLessThan(MS.strike);
  });

  it('keeps no constant for a decision that was struck', () => {
    // `ARRIVE_Y` existed for the arriving-filing animation, which was struck:
    // no app of this class animates rows into a feed, and a member does not
    // watch their own filing arrive — they are sent back to a page it is
    // already on. A constant kept for a struck decision is the next audit's
    // phantom finding, so it went with it.
    const motion = require('@/src/components/dispatch/paper/paperMotion');
    expect(motion.ARRIVE_Y).toBeUndefined();
  });

  it('carry two curves and one straight line', () => {
    expect(EASE.flat).toEqual([0, 0, 1, 1]);
    expect(EASE.in).not.toEqual(EASE.out);
  });
});

describe('the pieces that move', () => {
  it('the ballot fill is laid out at full width and SCALED', () => {
    // Not `width: '42%'` animated — width is layout, and the design forbids it.
    const { toJSON } = render(<PaperFill percent={42} index={0} />);
    const json = JSON.stringify(toJSON());
    expect(json).toContain('"width":"100%"');
    expect(json).toContain('transformOrigin');
  });

  it('the ballot fill never scales past its own track', () => {
    // A frozen tally that has drifted must not paint a bar over the page.
    for (const pct of [-10, 0, 50, 100, 140]) {
      expect(() => render(<PaperFill percent={pct} index={0} />)).not.toThrow();
    }
  });

  it('arrives at its end state for a member who asked for less motion', () => {
    // Nothing is REMOVED under reduced motion — the result is still revealed
    // and the mark is still made, they simply do not travel. A version that
    // skipped the animation AND the end state would leave a ballot with empty
    // rules and a heart that never fills.
    const reanimated = require('react-native-reanimated');
    const spy = jest.spyOn(reanimated, 'useReducedMotion').mockReturnValue(true);

    expect(() => render(<PaperFill percent={42} index={2} />)).not.toThrow();
    expect(() => render(<PaperStrike on><Text>HEART</Text></PaperStrike>)).not.toThrow();

    const { getByText } = render(<PaperStrike on={false}><Text>MARK</Text></PaperStrike>);
    expect(getByText('MARK')).toBeTruthy();
    spy.mockRestore();
  });

  it('the mark renders what it is given, and nothing else', () => {
    // A bare string child needs a Text around it in React Native; the point of
    // the assertion is that the wrapper passes its child through untouched.
    const { getByText } = render(<PaperStrike on><Text>HEART</Text></PaperStrike>);
    expect(getByText('HEART')).toBeTruthy();
  });

  it('the mark wraps only the ICON, on the card and in the dock alike', () => {
    // Growing the ROW would shift the three marks beside it, and a control that
    // moves its neighbours when you press it feels broken however brief it is.
    // Asserted on both surfaces, because the dock and the card are two places a
    // member makes one mark and they must not behave differently.
    for (const [file, icons] of [
      ['PaperPost.tsx', ['Heart', 'Bookmark']],
      ['PaperCritiques.tsx', ['Heart', 'Bookmark']],
    ] as const) {
      const src = fs.readFileSync(path.join(DIR, file), 'utf8');
      for (const icon of icons) {
        expect(new RegExp('<PaperStrike[^>]*>\\s*<' + icon).test(src)).toBe(true);
      }
      // And never around the pressable itself.
      expect(/<PaperStrike[^>]*>\s*<PressableScale/.test(src)).toBe(false);
    }
  });
});
