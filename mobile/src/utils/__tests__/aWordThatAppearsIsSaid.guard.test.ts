/**
 * A word that appears is said, and a film is said as it is printed: what a screen reader hears
 * matches what the screen draws.
 *
 * Words drawn because something happened (a refusal, a failure, a link sent) were drawn in red and
 * never spoken to a VoiceOver member, whose focus stays on the button they pressed (review round 12:
 * a refused security code, a seat requested, a link sent). SaidText speaks them as they appear on
 * both phones. And a film said by its title alone is said alike with every film of its title, though
 * the row prints each one's year (review round 14: three films called Nosferatu in the stack picker).
 *
 * This finder reads every screen file of the app (the universe's appCode) with the type checker:
 *   - a Text whose words are an act's outcome (a value named error, message, refusal, failure,
 *     notice) is SaidText, or listed with why;
 *   - an accessibilityLabel that names a title of a value that also holds its year (year,
 *     release_date, releaseDate) says the year too, or is listed with why.
 */
import { readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';
import { files } from '@/test-utils/universe';

/** The last name of a value that holds an act's outcome words. */
const OUTCOME = /(^|[a-z])(error|errorMsg|errorMessage|refusal|refused|failure|notice|message)$/i;
/** The names a film's year goes by on its own object. */
const YEAR_KEYS = ['year', 'release_date', 'releaseDate', 'film_year', 'filmYear'];

type Site = { file: string; line: number; what: string; text: string };

const nameOf = (e: ts.Expression): string | null => {
  let x: ts.Expression = e;
  while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) return x.name.text;
  return null;
};

/** Each site in one source file of a program. */
export function a11ySites(sf: ts.SourceFile, checker: ts.TypeChecker | null, file: string): Site[] {
  const out: Site[] = [];
  const at = (n: ts.Node, what: string) => out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, what, text: n.getText(sf).replace(/\s+/g, ' ').slice(0, 90) });
  const visit = (n: ts.Node): void => {
    // A Text whose one child is an act's outcome.
    if (ts.isJsxElement(n) && n.openingElement.tagName.getText(sf) === 'Text') {
      const kids = n.children.filter((c) => !(ts.isJsxText(c) && !c.text.trim()));
      const only = kids.length === 1 ? kids[0] : null;
      if (only && ts.isJsxExpression(only) && only.expression) {
        const name = nameOf(only.expression);
        if (name && OUTCOME.test(name)) at(n, 'words of an outcome drawn, never said');
      }
    }
    // A title said in a label, its own object holding its year unsaid.
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'accessibilityLabel' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      const label = n.initializer.expression;
      const said = label.getText(sf);
      const titles: ts.PropertyAccessExpression[] = [];
      const find = (x: ts.Node): void => {
        if (ts.isPropertyAccessExpression(x) && ['title', 'film_title', 'filmTitle'].includes(x.name.text)) titles.push(x);
        ts.forEachChild(x, find);
      };
      find(label);
      for (const t of titles) {
        const holder = t.expression;
        let holdsYear = false;
        if (checker) {
          const type = checker.getNonNullableType(checker.getTypeAtLocation(holder));
          holdsYear = YEAR_KEYS.some((k) => !!type.getProperty(k));
        } else {
          holdsYear = /film|item|log|o\b/.test(holder.getText(sf));
        }
        const saysYear = YEAR_KEYS.some((k) => said.includes(`.${k}`)) || /\bsaidFilm\(|\byearOf\(|\$\{\s*year\b/.test(said);
        if (holdsYear && !saysYear) at(n, 'a title said without the year it holds');
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const options = (): ts.CompilerOptions => {
  const config = ts.readConfigFile(join(MOBILE, 'tsconfig.json'), ts.sys.readFile).config;
  return { ...ts.parseJsonConfigFileContent(config, ts.sys, MOBILE).options, noEmit: true };
};

/** Sites where the rule's reason does not apply, as `file  what  words`, each with why. */
const JUDGED: Record<string, string> = {
  'app/(modals)/notifications-modal.tsx  words of an outcome drawn, never said  <Text style={s.itemMessage} numberOfLines={2} ellipsizeMode="tail"> {message} </Text>':
    "a notice's own words in the list of notices, read where the member meets them: content of a list, not an act's outcome",
  'src/components/Buster.tsx  words of an outcome drawn, never said  <Text style={s.bubbleText}>{message}</Text>':
    "the mascot's fixed line, drawn with the screen it stands on (profile's sign-in door), never after an act",
  'src/components/ErrorBoundary.tsx  words of an outcome drawn, never said  <Text style={styles.errorText}> {this.state.error.message} </Text>':
    "the crash net's debug text, drawn only in a development build (__DEV__), under the net's own said title",
  'src/components/RouteErrorBoundary.tsx  words of an outcome drawn, never said  <Text style={s.debug} numberOfLines={4}> {error.message} </Text>':
    "the room's crash net's debug text, drawn only in a development build (__DEV__), under the net's own said title",
  'src/components/FieldError.tsx  words of an outcome drawn, never said  <Text {...scaledTextProps} style={st.text}>{message}</Text>':
    "a field's refusal: the field carries it as its hint and focusField moves the member's focus there, so it is heard where it is (FieldError)",
  'src/components/ToastHost.tsx  words of an outcome drawn, never said  <Text ref={messageRef} style={styles.message} {...scaledTextProps} accessibilityLabel={`${':
    'the toast: Android speaks its live region and VoiceOver focus is moved onto this message, read once (ToastHost)',
  'src/components/ToastHost.tsx  words of an outcome drawn, never said  <Text style={styles.message}>{toast.message}</Text>':
    'the toast: Android speaks its live region and VoiceOver focus is moved onto the message, read once (ToastHost)',
};

const keyOf = (s: Site) => `${s.file}  ${s.what}  ${s.text}`;

describe('a word that appears is said, and a film is said as it is printed', () => {
  const roots = files('appCode', { ext: ['.tsx'] });
  const program = ts.createProgram(roots, options());
  const checker = program.getTypeChecker();
  const sites = roots.flatMap((p) => {
    const sf = program.getSourceFile(p);
    return sf ? a11ySites(sf, checker, relative(MOBILE, p).split(sep).join('/')) : [];
  });

  it('reads every screen of the app with the type checker', () => {
    expect(roots.length).toBeGreaterThan(150);
    expect(readFileSync(join(MOBILE, 'src', 'components', 'SaidText.tsx'), 'utf8')).toContain('announceForAccessibility');
  });

  it('draws no outcome unsaid, and says no title without the year its film holds, but where judged', () => {
    expect(sites.filter((s) => !JUDGED[keyOf(s)]).map((s) => `${s.file}:${s.line}  ${s.what}  ${s.text}`)).toEqual([]);
    const held = new Set(sites.map(keyOf));
    expect(Object.keys(JUDGED).filter((k) => !held.has(k))).toEqual([]);
  });

  it('finds each planted shape, by the type checker, and passes what is said', () => {
    const file = join(MOBILE, 'src', 'planted.tsx');
    const text = [
      'declare const Text: any; declare const SaidText: any; declare const Pressable: any; declare function saidFilm(t: string, y?: number | null): string;',
      'type Film = { title: string; year: number | null }; type Stack = { title: string };',
      'export const A = ({ error }: { error: string }) => <Text>{error}</Text>;',
      'export const B = ({ f }: { f: Film }) => <Pressable accessibilityLabel={`Remove ${f.title}`} />;',
      'export const C = ({ refusal }: { refusal: string }) => <SaidText>{refusal}</SaidText>;',
      'export const D = ({ f }: { f: Film }) => <Pressable accessibilityLabel={`Remove ${saidFilm(f.title, f.year)}`} />;',
      'export const E = ({ s }: { s: Stack }) => <Pressable accessibilityLabel={`Open ${s.title}`} />;',
      'export const F = ({ f }: { f: Film }) => <Pressable accessibilityLabel={[f.title, f.year].join(", ")} />;',
    ].join('\n');
    const host = ts.createCompilerHost(options());
    const read = host.getSourceFile;
    host.getSourceFile = (name, version) => (name.split('\\').join('/').endsWith('src/planted.tsx') ? ts.createSourceFile(name, text, version, true, ts.ScriptKind.TSX) : read(name, version));
    const program = ts.createProgram([file], options(), host);
    const sf = program.getSourceFile(file)!;
    expect(a11ySites(sf, program.getTypeChecker(), 'planted.tsx').map((s) => `${s.line} ${s.what}`)).toEqual([
      '3 words of an outcome drawn, never said',
      '4 a title said without the year it holds',
    ]);
  });
});
