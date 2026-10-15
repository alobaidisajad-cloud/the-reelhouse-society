/**
 * No view in the app is given Reanimated's `exiting`.
 *
 * An `exiting` animation withholds a removal React has already made, and every ancestor
 * removed with it. On Android, React can delete and re-create such a view under the same tag;
 * it stays mounted with no view state, and the next view added into it destroys React. A view
 * leaves through Presence instead (src/components/motion/Presence.tsx), which removes it by
 * state once its exit has played. Read with TypeScript's parser: a JSX attribute, not a word.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';

const SKIP = new Set(['__tests__', 'node_modules']);

function codeFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) codeFiles(full, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.|\.d\.ts$/.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * Every JSX `exiting` attribute in the files, as `file:line`; how many attributes were read;
 * and how many exits play through PresenceView.
 */
function exitingIn(files: string[]) {
  const found: string[] = [];
  let attributes = 0;
  let presenceExits = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const visit = (n: ts.Node) => {
      if (ts.isJsxAttribute(n)) {
        attributes += 1;
        const name = n.name.getText(sf);
        if (name === 'exiting') {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          found.push(`${relative(MOBILE, file).split(sep).join('/')}:${line + 1}`);
        }
        const owner = n.parent.parent;
        if (name === 'exit' && owner.tagName.getText(sf) === 'PresenceView') presenceExits += 1;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { found, attributes, presenceExits };
}

it('reads every JSX attribute in app/ and src/, and none is `exiting`', () => {
  const files = [...codeFiles(join(MOBILE, 'app')), ...codeFiles(join(MOBILE, 'src'))];
  const { found, attributes, presenceExits } = exitingIn(files);
  // A walker that read nothing would pass the check below while proving nothing.
  expect(files.length).toBeGreaterThanOrEqual(440);
  expect(attributes).toBeGreaterThanOrEqual(14000);
  // The app's exits, each played through PresenceView: a new one is counted here.
  expect(presenceExits).toBe(13);
  expect(found).toEqual([]);
});

it('says NO to each shape of `exiting`, and passes an entrance, the word as text, and a key', () => {
  const fixture = join(__dirname, 'fixtures', 'exiting.fixture.tsx');
  expect(exitingIn([fixture]).found).toEqual([
    'src/components/motion/__tests__/fixtures/exiting.fixture.tsx:12',
    'src/components/motion/__tests__/fixtures/exiting.fixture.tsx:14',
  ]);
});
