/**
 * aFlatSurfaceCastsNothing.test.ts — a surface made flat keeps no elevation.
 *
 * `effects.flat` clears a shadow's colour and opacity, which is all iOS and
 * Android 9+ read. Android before 9 cannot colour a shadow: any `elevation`
 * left in the same style (its own, or spread from `shadowSurface`,
 * `shadowPrimary`, …) draws a black one there, under a surface meant to cast
 * nothing. Each site is cleared feature by feature (some use elevation for
 * stacking and need reading first), so this ratchet only goes down.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MOBILE, stripComments } from '@/test-utils/readCode';

/** Every style object that spreads `effects.flat` and still carries elevation. */
function flatButElevated(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const code = stripComments(readFileSync(p, 'utf8'), p);
      let at = code.indexOf('...effects.flat');
      while (at >= 0) {
        // The style object it sits in: back to its opening brace.
        let depth = 0;
        let start = at;
        for (; start > 0; start--) {
          const ch = code[start];
          if (ch === '}') depth++;
          if (ch === '{') { if (depth === 0) break; depth--; }
        }
        const obj = code.slice(start, at);
        if (/\belevation\s*:|\.\.\.effects\.shadow\w+/.test(obj)) {
          out.push(`${relative(MOBILE, p)}:${code.slice(0, at).split('\n').length}`);
        }
        at = code.indexOf('...effects.flat', at + 1);
      }
    }
  };
  walk(join(MOBILE, 'src'));
  walk(join(MOBILE, 'app'));
  return out;
}

describe('a flat surface', () => {
  // Exact: one cleared is MOST lowered here, so the slack cannot let another in.
  const MOST = 18;
  it(`keeps elevation in exactly ${MOST} styles, and only fewer from here`, () => {
    expect(flatButElevated()).toHaveLength(MOST);
  });

  it('the Lounge has none left', () => {
    expect(flatButElevated().filter((s) => /lounge/i.test(s))).toEqual([]);
  });

  it('the detector sees one', () => {
    const src = "const s = { card: { ...effects.shadowSurface, ...effects.flat } };";
    expect(/\belevation\s*:|\.\.\.effects\.shadow\w+/.test(src.slice(src.indexOf('{ card') + 8, src.indexOf('...effects.flat')))).toBe(true);
  });
});
