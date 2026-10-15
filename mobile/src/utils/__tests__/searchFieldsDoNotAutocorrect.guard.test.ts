/**
 * searchFieldsDoNotAutocorrect.guard.test.ts — a field that searches for a
 * name never autocorrects it.
 * ─────────────────────────────────────────────────────────────────────────────
 * Film titles, directors, members and salons are names, and autocorrect turns
 * "Ozu" into "Out". On Android it also composes each word in the keyboard, and
 * the sealed E2E run showed the Darkroom's search losing its last letter that
 * way: the field read "The Godfather" while the app searched "the godfathe".
 *
 * A search field is one whose return key says "search", or whose placeholder or
 * label asks to search, find or name something. Read from the compiled JSX, so
 * a prop spelled any other way than `autoCorrect={false}` does not count.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';
import { files as universe } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');

const ASKS = /\b(search|find|name a film)/i;

type Field = { where: string; search: boolean; off: boolean };

function fields(file: string): Field[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Field[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'TextInput') {
      const props: Record<string, string> = {};
      for (const a of n.attributes.properties) {
        if (ts.isJsxAttribute(a)) props[a.name.getText(sf)] = a.initializer ? a.initializer.getText(sf) : 'true';
      }
      const search = props.returnKeyType === '"search"'
        || ASKS.test(props.placeholder ?? '') || ASKS.test(props.accessibilityLabel ?? '');
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      out.push({ where: `${relative(ROOT, file)}:${line}`, search, off: props.autoCorrect === '{false}' });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('a search field never autocorrects', () => {
  // Every file that can draw a field: JSX lives in .tsx.
  const all = universe('appCode', { ext: ['.tsx'] }).flatMap(fields);
  const searches = all.filter((f) => f.search);

  it('finds the search fields (a scan of none proves nothing)', () => {
    expect(searches.length).toBeGreaterThanOrEqual(10);
  });

  it('every one has autoCorrect={false}', () => {
    expect(searches.filter((f) => !f.off).map((f) => f.where)).toEqual([]);
  });
});
