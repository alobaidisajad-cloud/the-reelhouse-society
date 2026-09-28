/**
 * Where the screen generators read from and write to — one place, inside the
 * project.
 *
 * The generators mount a REAL screen from the app's own code and convert what
 * it resolves to into HTML (see `src/components/profile/__tests__/zz-render.lib.ts`),
 * so a design is judged on the screen itself rather than a drawing of it. Never a
 * temporary folder: the operating system clears those.
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

// Every width drawn and measured, with its height (which decides what scrolls): ONE list,
// devices.json, which harness.cjs reads too. 320 is iOS 15.1's narrowest; iPads from 744.
const DEVICES = JSON.parse(readFileSync(join(__dirname, 'devices.json'), 'utf8')) as { default: number; heightAt: Record<string, number> };
export const WIDTHS = Object.keys(DEVICES.heightAt).map(Number);
export const HEIGHT_AT: Record<number, number> = Object.fromEntries(Object.entries(DEVICES.heightAt).map(([w, h]) => [Number(w), h]));

// The device drawn ON (the default unless MOCKUPS_WIDTH names another), not only measured
// at: a box sized in code from the window is sized for the device it was drawn for.
const asked = Number(process.env.MOCKUPS_WIDTH ?? DEVICES.default);
if (!WIDTHS.includes(asked)) throw new Error(`MOCKUPS_WIDTH=${process.env.MOCKUPS_WIDTH} is not one of ${WIDTHS.join(', ')}`);
export const PHONE = { width: asked, height: HEIGHT_AT[asked] };

/** Screens drawn at the default width land in out/screens; at another, out/screens-<width>. */
export const OUT = process.env.MOCKUPS_OUT
  ?? join(__dirname, 'out', PHONE.width === DEVICES.default ? 'screens' : `screens-${PHONE.width}`);

/** `scaledTextProps`' ceiling: the size a capped word grows to at most. */
export const LARGE = 1.35;

// A screen that SIZES A BOX from the text size (useTextScale, useLineScale) is also
// laid out at the large sizes, `<name>@1.35.html` and `@android-<f>` (Android grows
// a set line height past any ceiling), and the tools open those; others are grown by CSS.
export const LAYOUTS = [
  { suffix: '', scale: 1, os: 'ios' },
  { suffix: `@${LARGE}`, scale: LARGE, os: 'ios' },
  // A text with its own lower ceiling (a title capped at 1.2) is still set on
  // a line Android grows the full 1.35, so Android at 1.35 is its own layout.
  { suffix: `@android-${LARGE}`, scale: LARGE, os: 'android' },
  { suffix: '@android-2', scale: 2, os: 'android' },
] as const;
export type Layout = (typeof LAYOUTS)[number];

/** The text size a generator's window stand-in reports, read at call time by every layout. */
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

/** `describe` when rendering was asked for; otherwise skipped, writing nothing. */
export const whenRendering: jest.Describe = RENDERING ? describe : describe.skip;

export function readFixture<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, file), 'utf8')) as T;
}

export function writeScreen(name: string, html: string): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.html`), html, 'utf8');
}
