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
const CONTROLS: { file: string; style: string; prop: 'minHeight' | 'height' | 'width'; note: string }[] = [
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
  { file: 'src/components/log/LogModalStyles.ts', style: 'statusBtn', prop: 'minHeight',
    note: 'watched / rewatched / abandoned — the first decision the page asks for' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'closeBtn', prop: 'minHeight',
    note: 'the way out — no border, so the growth is invisible' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'deleteBtn', prop: 'minHeight',
    note: 'destructive, and so the easiest thing to hit deliberately' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'pThumb', prop: 'width',
    note: 'alternate posters — 48x72 keeps the 2:3 a poster actually is' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'pImg', prop: 'width',
    note: 'the poster images in the same strip' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'listChipHit', prop: 'minHeight',
    note: 'the box AROUND the chip — the chip itself stays chip-sized' },
  { file: 'src/components/log/LogModalStyles.ts', style: 'backBtn', prop: 'height',
    note: 'the way back to search — a 20pt chevron in a 48pt box' },
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

  it('the header did not grow to pay for CLOSE', () => {
    // Raising the button to 48 must not push the chrome down the page: the
    // button's own box supplies the air the padding used to. 8 + 48 + 8 is the
    // 64 this header always was, and the mark stays 24pt from the top.
    const header = styleBody(read('src/components/log/LogModalStyles.ts'), 'header');
    expect(header).not.toBeNull();
    const pad = num(header!, 'paddingTop');
    const close = styleBody(read('src/components/log/LogModalStyles.ts'), 'closeBtn');
    expect(pad! * 2 + num(close!, 'minHeight')!).toBeLessThanOrEqual(64);
  });

  it('the chip is never stretched to fill its own touch box', () => {
    // A flex container defaults to align-items: stretch, which would have
    // grown the chip to 48 and undone the reason the box exists.
    const hit = styleBody(read('src/components/log/LogModalStyles.ts'), 'listChipHit');
    expect(hit).toMatch(/alignItems:\s*'flex-start'/);
  });

  it('the seal uses minHeight, so enlarged text grows it instead of clipping', () => {
    // A fixed `height` on a control whose label scales to 1.35x would cut the
    // label off. Every control here that wraps text must be free to grow.
    const body = styleBody(read('src/components/log/LogSealBar.tsx'), 'press');
    expect(body).not.toBeNull();
    expect(body).toMatch(/minHeight/);
    expect(body).not.toMatch(/[^n]\bheight:/);
  });
});
