/**
 * Every live channel the app joins is private, and the server has a rule for it.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house's rules for who receives a channel apply to a private join. Each
 * `supabase.channel(…)` in app/ and src/ is read
 * with TypeScript's parser and must pass `config: { private: true }`; then each
 * topic it joins must have a rule on realtime.messages in production as it
 * will be (the snapshot, and the migrations still pending), or a private join
 * of it would be refused for everyone.
 */
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import ts from 'typescript';
import { files as universe } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');


/** Each `supabase.channel(topic, options)`: where, its topic as written, and whether private. */
const channelsIn = (file: string, text: string) => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { site: string; topic: string; private: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'channel'
      && n.expression.expression.getText() === 'supabase') {
      const [topic, opts] = n.arguments;
      const config = opts && ts.isObjectLiteralExpression(opts)
        ? opts.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === 'config') : undefined;
      const isPrivate = !!config && ts.isObjectLiteralExpression(config.initializer) && config.initializer.properties.some((p) =>
        ts.isPropertyAssignment(p) && p.name.getText() === 'private' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
      found.push({ site: `${file.slice(MOBILE.length + 1).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`,
        topic: topic?.getText() ?? '', private: isPrivate });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
};

const CHANNELS = universe('appCode')
  .flatMap((f) => channelsIn(f, readFileSync(f, 'utf8')));

it('every channel the app joins is private', () => {
  expect(CHANNELS.length).toBeGreaterThanOrEqual(2);
  expect(CHANNELS.filter((c) => !c.private).map((c) => c.site)).toEqual([]);
});

it('every topic it joins has its rule on realtime.messages, in production as it will be', () => {
  const applied = new Set(readFileSync(join(MOBILE, 'supabase/APPLIED.txt'), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')));
  const pending = universe('migrations').filter((f) => !applied.has(basename(f))).map((f) => readFileSync(f, 'utf8'));
  const willBe = [readFileSync(join(MOBILE, 'supabase/schema/live-outside-public.sql'), 'utf8'), ...pending].join('\n');
  const rules = [...willBe.matchAll(/CREATE POLICY [^\n]*?ON realtime\.messages[\s\S]*?;/g)].map((m) => m[0]);
  // The two topics the app joins, as the code writes them.
  expect(CHANNELS.map((c) => c.topic).sort()).toEqual(['\'global_notifications\'', '`lounge-${loungeId}`']);
  expect(rules.some((r) => /FOR SELECT/.test(r) && /salon_channel_readable\(realtime\.topic\(\)\)/.test(r))).toBe(true);
  expect(rules.some((r) => /FOR SELECT/.test(r) && /realtime\.topic\(\) = 'global_notifications'/.test(r))).toBe(true);
});

it('the reader says NO to a public join, and to one whose private is not plainly true', () => {
  const read = (code: string) => channelsIn('x.ts', code).map((c) => c.private);
  expect(read('supabase.channel(\'a\', { config: { private: true } });')).toEqual([true]);
  expect(read('supabase.channel(\'a\');')).toEqual([false]);
  expect(read('supabase.channel(\'a\', { config: { presence: { key: 1 } } });')).toEqual([false]);
  expect(read('supabase.channel(\'a\', { config: { private: isPrivate } });')).toEqual([false]);
  expect(read('supabase.channel(\'a\', opts);')).toEqual([false]);
});
