/**
 * logTouchTargets.test.ts — the composer's controls clear the floor by their
 * own geometry.
 *
 * A halo is invisible to both platforms' accessibility layers: hitSlop lives
 * inside React Native's touch dispatch, iOS reports `accessibilityFrame` from
 * the view's frame, and RN installs no Android `TouchDelegate`. So the only
 * thing that answers "is this control big enough" is the control's own size.
 *
 * The floor is 48, not 44 — this app ships on Android too, where Material's
 * minimum is 48dp against Apple's 44pt.
 *
 * Found by auditing this page AFTER the standard was settled: the collapsed
 * Editorial Desk bar was ~33pt with `hitSlop={null}`, and every index row was
 * 37pt claiming nothing vertically. Both were reachable areas below even the
 * lower of the two standards, and both were introduced by fixes on this page —
 * the null and the zeroes were right, and the height was never raised to match.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const FLOOR = 48;

const read = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Brace-matched style body — survives nested objects and multi-line bodies. */
function styleBody(src: string, name: string): string | null {
  const re = new RegExp('(?:^|[\\s,{])(' + name + ')\\s*:\\s*\\{', 'gm');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (src[m.index + m[0].indexOf(name) - 1] === '.') continue;
    const start = src.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
    }
  }
  return null;
}
const num = (body: string, prop: string) => {
  const m = body.match(new RegExp('\\b' + prop + '\\s*:\\s*(\\d+(?:\\.\\d+)?)'));
  return m ? Number(m[1]) : null;
};

/**
 * Every control on this page whose height is fixed by its own style, and the
 * height it must reach. Each entry names WHY it is here, so a later redesign
 * that changes the number has to make the decision again rather than inherit
 * it.
 */
const CONTROLS: { file: string; style: string; prop: 'minHeight' | 'height'; note: string }[] = [
  { file: 'src/components/log/LogModalStyles.ts', style: 'idxEntry', prop: 'minHeight',
    note: 'the catalogue index rows — flush, so they can claim no slop at all' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deskFoot', prop: 'minHeight',
    note: 'the collapsed Editorial Desk bar — hitSlop null, so height is the only lever' },
  { file: 'src/components/log/LogSealBar.tsx', style: 'press', prop: 'minHeight',
    note: 'THE SEAL — the act this page exists for' },
  { file: 'src/components/log/EditorialDesk.tsx', style: 'stillImg', prop: 'height',
    note: 'article-header stills' },
  { file: 'src/components/log/EditorialDesk.tsx', style: 'stillThumb', prop: 'height',
    note: 'the NONE chip beside them' },
];

describe('the composer’s controls reach the floor without a halo', () => {
  for (const c of CONTROLS) {
    it(`${c.style} is at least ${FLOOR}pt (${c.note})`, () => {
      const body = styleBody(read(c.file), c.style);
      // A style that cannot be found must fail, never pass by absence.
      expect(body).not.toBeNull();
      const h = num(body!, c.prop);
      expect(h).not.toBeNull();
      expect(h).toBeGreaterThanOrEqual(FLOOR);
    });
  }

  it('the seal uses minHeight, so enlarged text grows it instead of clipping', () => {
    // A fixed `height` on a control whose label scales to 1.35x would cut the
    // label off. Every control here that wraps text must be free to grow.
    const body = styleBody(read('src/components/log/LogSealBar.tsx'), 'press');
    expect(body).not.toBeNull();
    expect(body).toMatch(/minHeight/);
    expect(body).not.toMatch(/[^n]\bheight:/);
  });
});
