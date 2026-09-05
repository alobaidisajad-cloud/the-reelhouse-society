/**
 * everyTextHasACeiling.test.ts — no <Text> on the Dispatch surface may scale
 * without a ceiling.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native's default is `allowFontScaling: true` with NO maximum, so a bare
 * <Text> grows without limit at accessibility sizes. This app's law is a
 * per-element cap — scaledTextProps (1.35), displayTextProps (1.2),
 * deckLabelProps (1.35 + shrink-to-fit for a row that cannot reflow), or
 * decorativeTextProps (does not scale at all).
 *
 * The writing room had none of them. Thirteen elements, including the header's
 * three-across row and the counter strip — the two places on the screen that
 * cannot reflow — scaled without any ceiling at all. Nothing caught it because
 * every other check renders at 1.0, where a missing cap looks exactly like a
 * present one.
 *
 * ── WHAT THIS TEST HAD TO GET RIGHT TO BE WORTH ANYTHING ────────────────────
 * Three things, each of which produced a confidently wrong answer first:
 *
 *  1. NESTING. `allowFontScaling` and `maxFontSizeMultiplier` are INHERITED by
 *     a nested <Text>. Eighteen inner spans here carry no props of their own and
 *     are perfectly fine. Flagging them buries the real ones.
 *
 *  2. THE PROP LIST. `deckLabelProps` was missing from the first version's list
 *     of sanctioned props, so it reported nine correctly-capped elements as
 *     bare. A hand-written list decides what a check can see — see the same
 *     lesson in the jest mock hand-lists.
 *
 *  3. THE OPENING TAG. JSX props contain '>' inside expressions, so a regex to
 *     the first '>' mis-reads the tag. It is walked with brace and quote
 *     awareness instead. Comments are blanked first, newlines kept, so a
 *     docstring naming a prop is not mistaken for that prop being used.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');

/** Every prop that puts a ceiling on how far text may grow. */
const CAPPING_PROPS = [
  'scaledTextProps',
  'displayTextProps',
  'decorativeTextProps',
  'deckLabelProps',
  'actionLabelProps',
  'UNSPOKEN',
  'allowFontScaling',
  'maxFontSizeMultiplier',
];

const collect = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__') collect(full, out);
    } else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
};

/** Blank comment bodies, KEEPING newlines so reported lines stay true. */
const blankComments = (s: string): string => {
  let out = '';
  let i = 0;
  const keep = (n: number) => s.slice(i, i + n).replace(/[^\n]/g, ' ');
  while (i < s.length) {
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      const stop = end === -1 ? s.length : end + 2;
      out += keep(stop - i);
      i = stop;
      continue;
    }
    if (s[i] === '/' && s[i + 1] === '/') {
      let stop = s.indexOf('\n', i);
      if (stop === -1) stop = s.length;
      out += keep(stop - i);
      i = stop;
      continue;
    }
    if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
      const q = s[i];
      out += s[i];
      i++;
      while (i < s.length && s[i] !== q) {
        if (s[i] === '\\') { out += s[i]; i++; }
        if (i < s.length) { out += s[i]; i++; }
      }
      if (i < s.length) { out += s[i]; i++; }
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
};

/** The opening tag's props, and whether it self-closes. */
const readTag = (src: string, from: number) => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote && src[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      return { props: src.slice(from, i), selfClosing: src[i - 1] === '/' };
    }
  }
  return { props: src.slice(from), selfClosing: false };
};

describe('every Text on the Dispatch surface has a ceiling', () => {
  const files = [
    ...collect(join(ROOT, 'src', 'components', 'dispatch')),
    ...collect(join(ROOT, 'app', 'dispatch')),
    join(ROOT, 'app', '(tabs)', 'dispatch.tsx'),
  ];

  const bare: string[] = [];
  let seen = 0;
  let inherited = 0;

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    const src = blankComments(readFileSync(file, 'utf8'));

    type Ev = { at: number; kind: 'open' | 'close'; len: number };
    const events: Ev[] = [];
    for (const m of src.matchAll(/<(Animated\.)?Text(?![A-Za-z0-9_])/g)) {
      events.push({ at: m.index!, kind: 'open', len: m[0].length });
    }
    for (const m of src.matchAll(/<\/(Animated\.)?Text\s*>/g)) {
      events.push({ at: m.index!, kind: 'close', len: m[0].length });
    }
    events.sort((a, b) => a.at - b.at);

    const stack: { capped: boolean }[] = [];
    for (const ev of events) {
      if (ev.kind === 'close') { stack.pop(); continue; }

      const { props, selfClosing } = readTag(src, ev.at + ev.len);
      const capped = CAPPING_PROPS.some((p) => props.includes(p));
      const underACap = stack.some((s) => s.capped);
      seen++;

      if (!capped && underACap) inherited++;
      else if (!capped) {
        const line = src.slice(0, ev.at).split('\n').length;
        bare.push(`${rel}:${line}  <Text ${props.replace(/\s+/g, ' ').trim().slice(0, 80)}>`);
      }
      if (!selfClosing) stack.push({ capped: capped || underACap });
    }
  }

  it('finds the Text elements at all, so a silent zero cannot pass for a clean sweep', () => {
    // A parser that matched nothing would report no faults and look identical to
    // a surface with none. 18 files and 250 Text elements today, so these floors
    // sit just under what is really there rather than at a round number — the
    // first draft asserted 20 files against an actual 18 and failed, which is
    // the assertion doing its job.
    expect(files.length).toBeGreaterThanOrEqual(18);
    expect(seen).toBeGreaterThanOrEqual(240);
  });

  it('counts the nested spans as covered rather than as faults', () => {
    // If this ever falls to zero the nesting logic has stopped working and the
    // test below is only passing because it stopped looking.
    expect(inherited).toBeGreaterThan(0);
  });

  it('leaves no Text scaling without a ceiling', () => {
    expect(bare).toEqual([]);
  });
});
