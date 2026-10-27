/**
 * EVERY LIVE CHANNEL HEARS ITS STATUS — the finder, as a test (P4.8, P4.10).
 *
 * A live channel that dropped and came back said nothing: what was said in the gap was never
 * read, and one that stayed down left its screen stale with the network up. The notices' channel
 * was subscribed with no status handler at all. So every `.subscribe(` on a `supabase.channel(…)`
 * chain, found through the syntax tree, hands its status to watchChannel, which reads again what
 * was missed and says when the channel is not live. A store's own `.subscribe(` (useAuthStore's,
 * a focus or connection listener) is not a channel and is not counted.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');

type Found = { line: number; heard: boolean };

/** Every channel subscription in a file, and whether its status reaches watchChannel. */
export function channelsOf(file: string, text: string): Found[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Found[] = [];
  /** Whether a call chain starts at `<something>.channel(…)`. */
  const fromChannel = (e: ts.Expression): boolean => {
    let n: ts.Node = e;
    while (ts.isCallExpression(n) || ts.isPropertyAccessExpression(n)) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'channel') return true;
      n = ts.isCallExpression(n) ? n.expression : n.expression;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'subscribe'
      && fromChannel(n.expression.expression)) {
      const handler = n.arguments[0];
      const heard = !!handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
        && /\.status\(\s*status\s*\)/.test(handler.body.getText(sf));
      out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, heard });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const census: Record<string, Found[]> = {};
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  const found = channelsOf(f, readFileSync(join(ROOT, f), 'utf8'));
  if (found.length) census[f] = found;
}

describe('every live channel hears its status', () => {
  it('finds the channels (the scan has not gone blind)', () => {
    expect(Object.keys(census).sort()).toEqual(['src/stores/lounge.ts', 'src/stores/notificationStore.ts']);
  });

  it('hands every channel’s status to watchChannel', () => {
    const deaf = Object.entries(census).flatMap(([f, found]) => found.filter((c) => !c.heard).map((c) => `${f}:${c.line}`));
    expect(deaf).toEqual([]);
  });

  it('tells a channel from a store, and a heard status from a deaf one', () => {
    const one = (src: string) => channelsOf('probe.ts', src);
    expect(one("supabase.channel('x').on('a', {}, f).subscribe();")).toEqual([{ line: 1, heard: false }]);
    expect(one("supabase.channel('x').subscribe((status) => { track(); });")).toEqual([{ line: 1, heard: false }]);
    expect(one("supabase.channel('x').on('a', {}, f).subscribe((status) => { watch.status(status); });")).toEqual([{ line: 1, heard: true }]);
    expect(one('useAuthStore.subscribe((s) => s.user);')).toEqual([]);
    expect(one('focusManager.subscribe((f) => go());')).toEqual([]);
  });
});
