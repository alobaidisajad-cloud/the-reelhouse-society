/**
 * aMembersWordsAreReadWhole.guard.test.ts — a member's own words are never cut where nothing shows them whole.
 * ─────────────────────────────────────────────────────────────────────────────
 * A clamp (`numberOfLines`) on a member's words is the design where the words are read whole a tap
 * away: a card, a row, a header that opens the piece. Where no tap opens them, the clamp is the only
 * reading there is, and the rest of the words are lost to the reader. Review round 14 found a salon's
 * name and description cut on every card and in the room's own sheet, a stack's title cut on its own
 * page, and a moderator's record and docket cut where a verdict is given.
 *
 * So, over the whole app: every element with a fixed clamp (a `numberOfLines` that can never be
 * `undefined`: an expander that lifts it passes) whose words are a member's own (a field a member
 * writes, a title or name of a thing a member makes, or a local holding one) stands inside something
 * a tap opens (onPress, href, onLongPress), or is judged here with why its words are read whole
 * elsewhere, or is named still to fix.
 */
import ts from 'typescript';
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

type Src = { file: string; text: string };

/** The fields a member writes, on whatever holds them. */
const FIELD = new Set([
  'description', 'bio', 'review', 'content', 'body', 'reason', 'abandoned_reason', 'message', 'note',
  'caption', 'pull_quote', 'pullQuote', 'dek', 'details', 'critique',
]);
/** What holds an error: its `message` is the app's or a library's words, never a member's. */
const NOT_A_MEMBER = new Set(['error', 'err', 'e', 'ex']);
/** The things a member makes and names, whose `title` or `name` is the member's words. A film's is not. */
const MADE = new Set(['list', 'stack', 'lounge', 'room', 'salon', 'series', 'filing', 'post', 'dossier', 'piece', 'words']);
/** A local, or a prop, that holds a member's words by its name alone. */
const BARE = new Set(['critique', 'body', 'bio', 'description', 'reason', 'review', 'content', 'note']);
const OPENS = new Set(['onPress', 'href', 'onLongPress']);

export type Cut = { at: string; line: number; words: string; opened: boolean };

const attrOf = (el: ts.JsxOpeningLikeElement, name: string) =>
  el.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name);

/** The last name of what a property is read on: `log.film` → film, `activeLounge` → activeLounge. */
function receiverOf(e: ts.Expression): string {
  let x = e;
  while (ts.isNonNullExpression(x) || ts.isParenthesizedExpression(x)) x = x.expression;
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) return x.name.text;
  return '';
}

/** A name's words: `activeLounge` → active, lounge; `pull_quote` → pull, quote. */
const wordsOf = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[\s_]+/);

/** The member's words an expression reads, as written, following a local of the same file to its making. */
function memberWords(e: ts.Node, locals: Map<string, ts.Expression>, depth = 0): string | null {
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      const on = receiverOf(n.expression);
      if (FIELD.has(name) && !NOT_A_MEMBER.has(on)) { found = n.getText(); return; }
      if ((name === 'title' || name === 'name') && wordsOf(on).some((w) => MADE.has(w))) found = n.getText();
      // Another field of what it is read on is that field's words alone, never the whole thing's.
      return;
    }
    if (ts.isCallExpression(n)) {
      n.arguments.forEach(visit);
      // A method of a value draws that value (`body.trim()`, `struck(x).toUpperCase()`); a function named alone draws its arguments.
      if (ts.isPropertyAccessExpression(n.expression)) visit(n.expression.expression);
      else if (!ts.isIdentifier(n.expression)) visit(n.expression);
      return;
    }
    if (ts.isIdentifier(n)) {
      if (BARE.has(n.text)) { found = n.text; return; }
      const made = locals.get(n.text);
      if (made && depth < 2) found = memberWords(made, locals, depth + 1) && n.text;
      return;
    }
    // A condition draws nothing: `rtl ? RTL_MARK : null` draws a mark, `words && <X/>` draws what follows.
    if (ts.isConditionalExpression(n)) { visit(n.whenTrue); visit(n.whenFalse); return; }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { visit(n.right); return; }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) return;
    ts.forEachChild(n, visit);
  };
  visit(e);
  return found;
}

/** Every element of one file with a fixed clamp on a member's words. */
export function cutsOf(file: string, text: string): Cut[] {
  if (!text.includes('numberOfLines')) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const locals = new Map<string, ts.Expression>();
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) locals.set(n.name.text, n.initializer);
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const out: Cut[] = [];
  /** The words a clamped element draws: its own expressions, and those of a Text nested in it with no clamp of its own. */
  const drawn = (el: ts.JsxElement): string | null => {
    for (const c of el.children) {
      if (ts.isJsxExpression(c) && c.expression) {
        const w = memberWords(c.expression, locals);
        if (w) return w;
      }
      if (ts.isJsxElement(c) && !attrOf(c.openingElement, 'numberOfLines')) {
        const w = drawn(c);
        if (w) return w;
      }
    }
    return null;
  };
  const visit = (n: ts.Node): void => {
    if (ts.isJsxElement(n)) {
      const clamp = attrOf(n.openingElement, 'numberOfLines');
      const lifts = clamp?.initializer && /\bundefined\b/.test(clamp.initializer.getText(sf));
      if (clamp && !lifts) {
        const words = drawn(n);
        if (words) {
          let opened = false;
          for (let p: ts.Node | undefined = n.parent; p && !opened; p = p.parent) {
            const el = ts.isJsxElement(p) ? p.openingElement : ts.isJsxSelfClosingElement(p) ? p : null;
            if (el && [...OPENS].some((a) => attrOf(el, a))) opened = true;
          }
          const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
          out.push({ at: `${file}  ${words}`, line, words, opened });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Cut, and read whole elsewhere: each with where, and why that is enough. */
const JUDGED: Record<string, string> = {
  'src/components/log/LogForm.tsx  previousLog.review':
    "the member's own earlier take, shown to them as they log the film again; it stands whole on its record's page (app/log/[id].tsx draws the review uncut)",
  'src/components/film/FilmReviews.tsx  review.abandoned_reason':
    "the verdict line of a card whose body opens the record (handleOpenLog), where LogHero draws the reason whole",
  'src/components/film/NitrateFileCard.tsx  critique':
    'the share card is a picture of a fixed size (LogShareCard): it shows the opening of the critique, and the record it is made from holds it whole',
  'app/lounge/[id].tsx  replyTo.content':
    'the quote of a message being replied to, above the composer: the message itself stands whole in the room just above it',
};

/** Found and not yet mended: each comes off as it is fixed. */
const STILL_TO_FIX: string[] = [];

/** The clamped member words that no tap opens and nothing judges, over an app. */
export function openOf(app: Src[]): string[] {
  return [...new Set(app.flatMap((f) => cutsOf(f.file, f.text)).filter((c) => !c.opened && !(c.at in JUDGED)).map((c) => c.at))].sort();
}

const APP: Src[] = files('appCode', { ext: ['.tsx'] }).map((f) => ({ file: rel(f).replace(/^mobile\//, ''), text: readCode(f) }));

describe('the finder', () => {
  const planted: Src = { file: 'src/Planted.tsx', text: `
    export function Planted({ log, lounge, film, error, critique, salonRow }) {
      const [whole, setWhole] = useState(false);
      const title = struck(salonRow.name);
      const beat = { eyebrow: 'ACT I', body: log.body };
      const rtl = isRTLText(log.body);
      return (<>
        <Text numberOfLines={2}>{log.review}</Text>
        <Text numberOfLines={1}>{struck(lounge.name)}</Text>
        <Text numberOfLines={3}>“{critique}”</Text>
        <Text numberOfLines={2}>{title}</Text>
        <Text numberOfLines={4}><Text>{'BY '}</Text><Text>{log.body}</Text></Text>
        <Text numberOfLines={1}>{log.review.trim().toUpperCase()}</Text>
        <Text numberOfLines={2}>{shown && log.caption}</Text>
        <Text numberOfLines={2}>{film.title}</Text>
        <Text numberOfLines={4}>{error.message}</Text>
        <Text numberOfLines={1}>{beat.eyebrow}</Text>
        <Text numberOfLines={1}>{rtl ? RTL_MARK : null}{film.title}</Text>
        <Text numberOfLines={whole ? undefined : 3}>{log.content}</Text>
        <Text>{log.description}</Text>
        <PressableScale onPress={open}><View><Text numberOfLines={2}>{log.note}</Text></View></PressableScale>
        <Link href="/x"><Text numberOfLines={1}>{lounge.description}</Text></Link>
      </>);
    }` };

  it('finds a member’s words cut where no tap opens them, and passes a film’s, an error’s, another field, an expander and a card', () => {
    expect(cutsOf(planted.file, planted.text).filter((c) => !c.opened).map((c) => `${c.line} ${c.words}`)).toEqual([
      '8 log.review',
      '9 lounge.name',
      '10 critique',
      '11 title',
      '12 log.body',
      '13 log.review',
      '14 log.caption',
    ]);
    expect(cutsOf(planted.file, planted.text).filter((c) => c.opened).map((c) => `${c.line} ${c.words}`)).toEqual([
      '21 log.note',
      '22 lounge.description',
    ]);
  });

  it('finds the instances it was made for, put back', () => {
    const putBack = (file: string, from: string, to: string) => {
      expect(APP.find((x) => x.file === file)?.text.split(from).length).toBe(2);
      return openOf(APP.map((x) => (x.file === file ? { ...x, text: x.text.split(from).join(to) } : x)));
    };
    // Round 14: a salon's name and description cut in the sheet that is the one place they are read whole.
    expect(putBack('src/components/lounge/LoungeSettingsPanel.tsx', '<Text style={s.title}>{struck(lounge.name)}</Text>',
      '<Text style={s.title} numberOfLines={1}>{struck(lounge.name)}</Text>'))
      .toContain('src/components/lounge/LoungeSettingsPanel.tsx  lounge.name');
    expect(putBack('src/components/lounge/LoungeSettingsPanel.tsx', '<Text style={[s.description, isRTLText(lounge.description) && rtlText]}>',
      '<Text style={s.subtitle} numberOfLines={2}>'))
      .toContain('src/components/lounge/LoungeSettingsPanel.tsx  lounge.description');
    // Round 14: a stack's title cut on its own page, held by a local made from list.title.
    expect(putBack('app/stacks/[id].tsx', '<Text style={[s.title, { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight }]}>',
      '<Text style={[s.title, { fontSize: titleType.fontSize, lineHeight: titleType.lineHeight }]} numberOfLines={4}>'))
      .toContain('app/stacks/[id].tsx  struckTitle');
    // Round 14: a bio written one line to an item cut at four.
    expect(putBack('app/user/[username].tsx', '<Text {...scaledTextProps} style={[s.heroBio, bioStyle]}>',
      '<Text {...scaledTextProps} style={[s.heroBio, bioStyle]} numberOfLines={4}>'))
      .toContain('app/user/[username].tsx  bioText');
    // Stage C: the Tribunal's record of a past verdict, its reason cut to one line.
    expect(putBack('app/(admin)/tribunal.tsx', '<Text style={s.historyReason} selectable>',
      '<Text style={s.historyReason} numberOfLines={1}>'))
      .toContain('app/(admin)/tribunal.tsx  record.reason');
    // Stage C: a reported title cut at two lines in the evidence.
    expect(putBack('app/(admin)/tribunal.tsx', '<Text style={s.evidenceTitle} selectable>{words.title}',
      '<Text style={s.evidenceTitle} numberOfLines={2}>{words.title}'))
      .toContain('app/(admin)/tribunal.tsx  words.title');
    // Stage C: the reported docket's filing held at three lines under its verdicts, nothing opening it.
    expect(putBack('src/components/dispatch/paper/PaperMore.tsx', 'numberOfLines={measured?.body === body ? undefined : CASE_LINES}',
      'numberOfLines={CASE_LINES}'))
      .toContain('src/components/dispatch/paper/PaperMore.tsx  words');
  });
});

describe('the whole app', () => {
  const CUTS = APP.flatMap((f) => cutsOf(f.file, f.text));

  it('reads the app, not an empty sweep', () => {
    expect(APP.length).toBeGreaterThan(200);
    expect(CUTS.length).toBeGreaterThan(15);
    expect(CUTS.filter((c) => c.opened).length).toBeGreaterThan(10);
  });

  it('a member’s words are never cut where no tap opens them, but where judged read whole elsewhere', () => {
    expect(openOf(APP)).toEqual([...STILL_TO_FIX].sort());
  });

  it('judges only cuts that are still there', () => {
    const at = new Set(CUTS.map((c) => c.at));
    expect([...Object.keys(JUDGED), ...STILL_TO_FIX].filter((k) => !at.has(k))).toEqual([]);
  });
});
