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


/**
 * Each `supabase.channel(topic, options)`: where, its topic as written, and whether private. A channel
 * opened through openChannel (src/lib/openChannel.ts, review round 9) is handed its topic as the
 * opener's parameter: its topic is the one written at `openChannel(T, (topic) => supabase.channel(topic, …))`.
 */
const channelsIn = (file: string, text: string) => {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: { site: string; topic: string; private: boolean }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'channel'
      && n.expression.expression.getText() === 'supabase') {
      const [topic, opts] = n.arguments;
      // The opener's parameter, read back to the topic written at its openChannel call.
      let named = topic?.getText() ?? '';
      for (let up: ts.Node | undefined = n.parent; up; up = up.parent) {
        if (!ts.isArrowFunction(up) && !ts.isFunctionExpression(up)) continue;
        const param = up.parameters[0]?.name.getText();
        const call = up.parent;
        if (param && param === named && ts.isCallExpression(call) && call.expression.getText() === 'openChannel' && call.arguments[1] === up) {
          named = call.arguments[0]?.getText() ?? named;
        }
        break;
      }
      const config = opts && ts.isObjectLiteralExpression(opts)
        ? opts.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === 'config') : undefined;
      const isPrivate = !!config && ts.isObjectLiteralExpression(config.initializer) && config.initializer.properties.some((p) =>
        ts.isPropertyAssignment(p) && p.name.getText() === 'private' && p.initializer.kind === ts.SyntaxKind.TrueKeyword);
      found.push({ site: `${file.slice(MOBILE.length + 1).replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`,
        topic: named, private: isPrivate });
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
  // Each rule as it was made, and as a later migration changed it (ALTER POLICY ... USING): a rule's
  // reach is read from its latest words, keyed by its name.
  const latest = new Map<string, string>();
  for (const m of willBe.matchAll(/(CREATE|ALTER) POLICY ("[^"]+"|\w+) ON realtime\.messages[\s\S]*?;/g)) {
    const name = m[2] ?? '';
    const made = m[1] === 'CREATE';
    // An ALTER keeps the command the rule was made for (FOR SELECT), and takes its new USING.
    const before = latest.get(name) ?? '';
    latest.set(name, made ? m[0] : `${(/FOR \w+/.exec(before) ?? [''])[0]} ${m[0]}`);
  }
  const rules = [...latest.values()];
  // The three topics the app joins, as the code writes them: a salon's, the notices', and the member's
  // own word of notices the house took back (round 12).
  expect(CHANNELS.map((c) => c.topic).sort()).toEqual(['\'global_notifications\'', '`lounge-${loungeId}`', '`notices:${user.id}`']);
  expect(rules.some((r) => /FOR SELECT/.test(r) && /salon_channel_readable\(realtime\.topic\(\)\)/.test(r))).toBe(true);
  expect(rules.some((r) => /FOR SELECT/.test(r) && /realtime\.topic\(\) = 'global_notifications'/.test(r))).toBe(true);
  // A member's own topic, and only their own: the topic is the member's id, asked of the session. Read as a
  // migration writes it and as the database prints it back once applied ('notices:'::text || ..., in brackets).
  expect(rules.some((r) => /FOR SELECT/.test(r)
    && /realtime\.topic\(\) = \(?'notices:'(::text)? \|\| \(\( ?SELECT auth\.uid\(\) AS uid\)\)::text/.test(r))).toBe(true);
});

it('the reader says NO to a public join, and to one whose private is not plainly true', () => {
  const read = (code: string) => channelsIn('x.ts', code).map((c) => c.private);
  expect(read('supabase.channel(\'a\', { config: { private: true } });')).toEqual([true]);
  expect(read('supabase.channel(\'a\');')).toEqual([false]);
  expect(read('supabase.channel(\'a\', { config: { presence: { key: 1 } } });')).toEqual([false]);
  expect(read('supabase.channel(\'a\', { config: { private: isPrivate } });')).toEqual([false]);
  expect(read('supabase.channel(\'a\', opts);')).toEqual([false]);
});

it('reads a topic through openChannel: the opener\'s parameter is the topic written at its call', () => {
  const topics = (code: string) => channelsIn('x.ts', code).map((c) => c.topic);
  expect(topics('openChannel(\'global_notifications\', (topic) => supabase.channel(topic, { config: { private: true } }));')).toEqual(['\'global_notifications\'']);
  expect(topics('openChannel(\'a\', (t) => { const c = supabase.channel(t, { config: { private: true } }).subscribe(); return c; });')).toEqual(['\'a\'']);
  // Not an opener: a parameter of another call stays as written.
  expect(topics('other(\'a\', (topic) => supabase.channel(topic, { config: { private: true } }));')).toEqual(['topic']);
});
