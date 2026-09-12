/**
 * aControlsNameCanBeRead.test.ts — a button whose label a member cannot enlarge.
 * ─────────────────────────────────────────────────────────────────────────────
 * `decorativeTextProps` is `allowFontScaling: false` and nothing else. Its own
 * doc says what it is for: "decorative/atmospheric text (stamps, watermarks,
 * tickers)". `everyTextHasACeiling` accepts it, and rightly — a freeze IS a
 * ceiling. What nothing asked was whether a freeze is the RIGHT ceiling for a
 * particular text.
 *
 * It was not, twenty times. The form names in "what are you filing?", THE HOUSE
 * RULES, THE MEMBER'S FILE, SET THE SERIES, the whole face of a lounge card —
 * all inside something tappable, all frozen, and several of them frozen while
 * the line of description directly underneath scaled. A member who turns their
 * text size up got a bigger page with the controls' names still at 7.5pt.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 * A text inside a Pressable is the name of a control. It must scale. The
 * exceptions are written down below, with the reason, and there are three
 * kinds of them:
 *
 *   ORNAMENTS      a picture made out of a character — ✦ ✗ · —  — which say
 *                  nothing when read aloud and nothing when enlarged
 *   ORDINAL MARKS  a numeral in the ordering margin, whose column is a measured
 *                  fixed width (21pt, sized so `III.` is not cut by two)
 *   THE SHARE CARD an image exported at fixed dimensions; PaperMore's own note
 *                  says every string on it is frozen on purpose
 *
 * Anything else that is frozen inside a Pressable fails, and the fix is
 * `deckLabelProps` — scaling, one line, and shrink-to-fit, so a label in a row
 * that cannot reflow gets smaller rather than breaking the row.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// The project's own compiler, so the scan parses JSX rather than guessing at it
// with a regex — an earlier regex version of this same idea had false negatives
// on `{cond ? <Text>LABEL</Text> : null}`.
const ts = require('typescript');

const DISPATCH = join(__dirname, '..');
const APP = join(__dirname, '..', '..', '..', '..', 'app', 'dispatch');

const collect = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') collect(full, out); }
    else if (e.name.endsWith('.tsx')) out.push(full);
  }
  return out;
};

const FILES = [...collect(DISPATCH), ...collect(APP)];

const PRESSABLE = /^(PressableScale|Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)$/;
/** A picture made out of a character: no letter and no digit in it. */
const ORNAMENT = /^[^A-Za-z0-9]{1,3}$/u;

/**
 * The two frozen texts that are allowed to sit inside a Pressable, and why.
 * Both are numerals in the ordering margin — a fixed 21pt column measured so
 * that `III.` is not cut by two points. Growing them would break the column
 * they were measured into, and neither is a word a member reads to act: the
 * accessibility label on the button beside them says "Part 3" out loud.
 */
const ALLOWED = [
  { file: 'PaperBallot.tsx', content: '{ROMAN[i]}', why: 'the option numeral, in the 21pt margin' },
  { file: 'PaperEssay.tsx', content: '{x.n}', why: 'the part numeral, in the ordering margin' },
];

type Frozen = { file: string; line: number; content: string };

const frozenInPressables = (): Frozen[] => {
  const found: Frozen[] = [];
  for (const file of FILES) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('decorativeTextProps')) continue;
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const tagOf = (el: any) =>
      ts.isJsxElement(el) ? el.openingElement.tagName.getText()
        : ts.isJsxSelfClosingElement(el) ? el.tagName.getText() : null;

    const visit = (node: any, depth: number) => {
      const tag = (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) ? tagOf(node) : null;
      const next = tag && PRESSABLE.test(tag) ? depth + 1 : depth;

      if (ts.isJsxElement(node) && tag === 'Text' && next > 0) {
        const frozen = node.openingElement.attributes.properties.some(
          (a: any) => ts.isJsxSpreadAttribute(a) && /decorativeTextProps/.test(a.expression.getText()),
        );
        if (frozen) {
          const content = node.children
            .map((k: any) => (ts.isJsxText(k) ? k.getText().trim()
              : ts.isJsxExpression(k) ? `{${k.expression?.getText().replace(/\s+/g, ' ') ?? ''}}` : ''))
            .filter(Boolean).join(' ').slice(0, 48);
          if (!ORNAMENT.test(content)) {
            const { line } = src.getLineAndCharacterOfPosition(node.getStart());
            found.push({ file: file.split(/[\\/]/).pop() as string, line: line + 1, content });
          }
        }
      }
      ts.forEachChild(node, (c: any) => visit(c, next));
    };
    visit(src, 0);
  }
  return found;
};

describe("a control's name can be read", () => {
  const found = frozenInPressables();

  it('nothing frozen sits inside a Pressable except the declared ordinal marks', () => {
    const unexpected = found.filter(
      (f) => !ALLOWED.some((a) => a.file === f.file && a.content === f.content),
    );
    // Named, not counted: a bare number tells nobody which control lost its
    // voice. Any failure here prints the file, the line and the words.
    expect(unexpected.map((f) => `${f.file}:${f.line} ${f.content}`)).toEqual([]);
  });

  it('every declared exception is still really there', () => {
    for (const a of ALLOWED) {
      const hit = found.find((f) => f.file === a.file && f.content === a.content);
      // A stale exception is worse than none: it reads as a considered decision
      // about something that no longer exists.
      expect(`${a.file} ${a.content}: ${hit != null}`).toBe(`${a.file} ${a.content}: true`);
    }
  });

  it('the scan can SEE a frozen control — it is not passing on an empty read', () => {
    expect(FILES.length).toBeGreaterThan(8);
    // The two allowed ones prove the detector reaches inside a Pressable at all.
    expect(found.length).toBe(ALLOWED.length);
  });

  it('the labels that were unfrozen use the prop that cannot overflow a row', () => {
    // `deckLabelProps` is scaling PLUS numberOfLines 1 and adjustsFontSizeToFit,
    // so a label in a row that cannot reflow shrinks instead of breaking it.
    const more = readFileSync(join(DISPATCH, 'paper', 'PaperMore.tsx'), 'utf8');
    expect((more.match(/deckLabelProps/g) ?? []).length).toBeGreaterThanOrEqual(15);
    const picker = readFileSync(join(DISPATCH, 'SeriesPicker.tsx'), 'utf8');
    expect(picker).toMatch(/>SET THE SERIES<|SET THE SERIES/);
    expect((picker.match(/deckLabelProps/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the share card stays frozen — it is an image at fixed dimensions', () => {
    const more = readFileSync(join(DISPATCH, 'paper', 'PaperMore.tsx'), 'utf8');
    // Its own note says so, and the card is exported rather than read on screen.
    expect(more).toMatch(/every string on this card is `decorativeTextProps`/);
    for (const mark of ['THE DISPATCH', 'REELHOUSE', 'THE ESSAY CONTINUES']) {
      const at = more.indexOf(mark);
      expect(`${mark} found: ${at !== -1}`).toBe(`${mark} found: true`);
      expect(more.slice(Math.max(0, at - 220), at)).toMatch(/decorativeTextProps/);
    }
  });
});
