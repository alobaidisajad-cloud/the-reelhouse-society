/**
 * Where the screen generators read from and write to — one place, inside the
 * project.
 *
 * The generators mount a REAL screen from the app's own code and convert what
 * it resolves to into HTML (see `src/components/profile/__tests__/zz-render.lib.ts`),
 * so a design is judged on the screen itself rather than a drawing of it. They
 * used to read their sample films from, and write into, a temporary folder of
 * one working session: the operating system clears those, and the film page's
 * sample had already been lost once that way.
 *
 *   FIXTURES  sample films, lists and artwork (committed)
 *   OUT       rendered screens, one `<name>.html` each (ignored by git)
 *
 * A generator only renders when asked: `MOCKUPS=1 npx jest zz-<name>.gen`.
 * `MOCKUPS_OUT` overrides where they land.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export const FIXTURES = join(__dirname, 'fixtures');

/**
 * Every width the app is drawn and measured at — ONE list, in devices.json,
 * which the measuring tools (harness.cjs) read too. 320 is the narrowest phone
 * iOS 15.1 (our floor) runs on; 375 the iPhone SE 2/3 and mini; 744–1024 the
 * iPads, since supportsTablet is on. Each carries its own height, because a frame's height decides what
 * scrolls.
 */
const DEVICES = JSON.parse(readFileSync(join(__dirname, 'devices.json'), 'utf8')) as { default: number; heightAt: Record<string, number> };
export const WIDTHS = Object.keys(DEVICES.heightAt).map(Number);
export const HEIGHT_AT: Record<number, number> = Object.fromEntries(Object.entries(DEVICES.heightAt).map(([w, h]) => [Number(w), h]));

/**
 * The device the screens are drawn ON. 390×844 unless MOCKUPS_WIDTH names
 * another width from WIDTHS — and then the screen is DRAWN at it, not only
 * measured at it: a box a screen sizes in code from the window is sized for
 * that device. (Measuring a 390 render at 320 reported a poster rail and a
 * stack grid running off a phone they were never laid out for.)
 */
const asked = Number(process.env.MOCKUPS_WIDTH ?? DEVICES.default);
if (!WIDTHS.includes(asked)) throw new Error(`MOCKUPS_WIDTH=${process.env.MOCKUPS_WIDTH} is not one of ${WIDTHS.join(', ')}`);
export const PHONE = { width: asked, height: HEIGHT_AT[asked] };

/** Screens drawn at the default width land in out/screens; at another, out/screens-<width>. */
export const OUT = process.env.MOCKUPS_OUT
  ?? join(__dirname, 'out', PHONE.width === DEVICES.default ? 'screens' : `screens-${PHONE.width}`);

/**
 * The largest text size the app lets a word grow to (`scaledTextProps`). Most
 * screens are rendered once and the measuring tools grow each text by CSS. A
 * screen that SIZES A BOX from the text size (`useTextScale`/`useLineScale`)
 * is also laid out at the large sizes — `<name>@1.35.html` for iOS, and
 * `<name>@android-1.35.html` / `<name>@android-2.html` for Android, where a
 * set line height keeps growing past any ceiling — and the tools open those.
 */
export const LARGE = 1.35;

export const LAYOUTS = [
  { suffix: '', scale: 1, os: 'ios' },
  { suffix: `@${LARGE}`, scale: LARGE, os: 'ios' },
  // A text with its own lower ceiling (a title capped at 1.2) is still set on
  // a line Android grows the full 1.35, so Android at 1.35 is its own layout.
  { suffix: `@android-${LARGE}`, scale: LARGE, os: 'android' },
  { suffix: '@android-2', scale: 2, os: 'android' },
] as const;
export type Layout = (typeof LAYOUTS)[number];

/**
 * The text-size setting a generator's `useWindowDimensions` stand-in reports.
 * Read at call time — `fontScale: require('@/mockups/paths').textSize.scale` —
 * so one mock serves every layout.
 */
export const textSize = { scale: 1 };

/**
 * Render inside one layout: the setting, and the platform. Only what is read
 * DURING render follows the platform; a `Platform.select` evaluated when a
 * module loaded stays as it was, so this is Android's text sizing, not an
 * Android build.
 */
export async function atLayout<T>(layout: Layout, fn: () => Promise<T> | T): Promise<T> {
  const RN = require('react-native');
  const was = RN.Platform.OS;
  textSize.scale = layout.scale;
  RN.Platform.OS = layout.os;
  try {
    return await fn();
  } finally {
    textSize.scale = 1;
    RN.Platform.OS = was;
  }
}

/** True when this run was asked to render screens. */
export const RENDERING = !!process.env.MOCKUPS;

/** `describe` when rendering was asked for, `describe.skip` otherwise — so a
 *  normal test run reports the generators as skipped rather than writing files. */
export const whenRendering: jest.Describe = RENDERING ? describe : describe.skip;

export function readFixture<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as T;
}

export function writeScreen(name: string, html: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
}
