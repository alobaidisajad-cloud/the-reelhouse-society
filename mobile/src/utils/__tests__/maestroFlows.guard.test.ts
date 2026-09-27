/**
 * Every Maestro flow asks the app only for what the app has.
 * ─────────────────────────────────────────────────────────────────────────────
 * Eight of the thirteen flows named markers the app had dropped
 * (`log-film-button`, `"EDIT LOG"`, `"ELEVATE YOUR DEVOTION"`) and signed in as
 * an account that never existed. Nothing said so, because the flows only ran
 * on a device, and the device job had not passed in months.
 *
 * So each flow is read here, on every push:
 *   · every `id:` must be a testID in the app — literally, or as a template
 *     (`collection-card-${item.id}`) whose fixed part matches
 *   · every text it looks for must match, as Maestro matches (a whole-string
 *     pattern), some text written in the app
 *   · it drives this app (the Android package in app.json), and it holds no
 *     account: sign-in values come from the run as ${E2E_…}
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import ts from 'typescript';

const { parseAllDocuments } = require(require.resolve('yaml/package.json').replace(/package\.json$/, 'dist/index.js')) as typeof import('yaml');

const MOBILE = join(__dirname, '..', '..', '..');
const FLOW_DIR = join(MOBILE, '.maestro');
const APP_ID = JSON.parse(readFileSync(join(MOBILE, 'app.json'), 'utf8')).expo.android.package as string;

const walk = (dir: string, keep: (f: string) => boolean, out: string[] = []): string[] => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '__tests__'].includes(e.name)) walk(p, keep, out); } else if (keep(e.name)) out.push(p);
  }
  return out;
};

const APP_FILES = [...walk(join(MOBILE, 'app'), (f) => /\.tsx?$/.test(f)), ...walk(join(MOBILE, 'src'), (f) => /\.tsx?$/.test(f))];
const SOURCE = APP_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');

/** Every testID the app sets: literal ones, and the fixed start of templated ones. */
const LITERAL_IDS = new Set([...SOURCE.matchAll(/(?:testID|tabBarButtonTestID)\s*[=:]\s*\{?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
const TEMPLATE_IDS = [...SOURCE.matchAll(/testID\s*=\s*\{\s*`([^`$]*)\$\{/g)].map((m) => m[1]).filter(Boolean);

/**
 * Every string the app writes — each string literal, the fixed text of each
 * template, and each run of JSX text — found by TypeScript's own parser, so an
 * apostrophe in a comment ("it's") cannot be mistaken for a quote.
 */
const TEXTS: string[] = [];
for (const file of APP_FILES) {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) TEXTS.push(n.text);
    else if (ts.isTemplateExpression(n)) TEXTS.push(n.head.text, ...n.templateSpans.map((s) => s.literal.text));
    else if (ts.isJsxText(n) && n.text.trim()) TEXTS.push(n.text.trim().replace(/\s+/g, ' '));
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/** What a flow file asks for. */
type Ask = { kind: 'id' | 'text'; value: string; flow: string };
const FILES = walk(FLOW_DIR, (f) => f.endsWith('.yaml') && f !== 'config.yaml');
const ids = (v: unknown): string[] => (v && typeof v === 'object' && 'id' in v ? [String((v as { id: unknown }).id)] : []);
const texts = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : v && typeof v === 'object' && 'text' in v ? [String((v as { text: unknown }).text)] : [];

const asksIn = (file: string) => {
  const flow = relative(FLOW_DIR, file).split('\\').join('/');
  const docs = parseAllDocuments(readFileSync(file, 'utf8')).map((d) => d.toJS());
  const [config, steps] = docs;
  const asks: Ask[] = [];
  const visit = (step: unknown): void => {
    if (!step || typeof step !== 'object') return;
    for (const [cmd, arg] of Object.entries(step as Record<string, unknown>)) {
      if (['tapOn', 'assertVisible', 'assertNotVisible', 'scrollUntilVisible'].includes(cmd)) {
        const target = cmd === 'scrollUntilVisible' && arg && typeof arg === 'object' ? (arg as { element: unknown }).element : arg;
        ids(target).forEach((value) => asks.push({ kind: 'id', value, flow }));
        texts(target).forEach((value) => asks.push({ kind: 'text', value, flow }));
      }
      if (cmd === 'extendedWaitUntil' && arg && typeof arg === 'object') {
        for (const k of ['visible', 'notVisible']) {
          const target = (arg as Record<string, unknown>)[k];
          ids(target).forEach((value) => asks.push({ kind: 'id', value, flow }));
          texts(target).forEach((value) => asks.push({ kind: 'text', value, flow }));
        }
      }
      if (cmd === 'repeat' && arg && typeof arg === 'object') ((arg as { commands?: unknown[] }).commands ?? []).forEach(visit);
    }
  };
  (Array.isArray(steps) ? steps : []).forEach(visit);
  return { flow, config: config as { appId?: string }, asks, text: readFileSync(file, 'utf8') };
};
const FLOWS = FILES.map(asksIn);

const idExists = (id: string) => LITERAL_IDS.has(id) || TEMPLATE_IDS.some((t) => id.startsWith(t) && id.length > t.length);
const textExists = (pattern: string) => {
  // Maestro's patterns are Java's: a leading (?i) means "ignore case".
  const ignoreCase = pattern.startsWith('(?i)');
  let re: RegExp;
  try { re = new RegExp(`^(?:${ignoreCase ? pattern.slice(4) : pattern})$`, ignoreCase ? 'si' : 's'); } catch { return false; }
  return TEXTS.some((t) => re.test(t) || re.test(t.trim()));
};

it('reads the flows and the app — it cannot pass on nothing', () => {
  expect(FLOWS.length).toBeGreaterThanOrEqual(13);
  expect(LITERAL_IDS.size).toBeGreaterThan(20);
  expect(TEMPLATE_IDS).toEqual(expect.arrayContaining(['collection-card-', 'film-act-']));
});

it('every id a flow looks for is a testID in the app', () => {
  const missing = FLOWS.flatMap((f) => f.asks).filter((a) => a.kind === 'id' && !idExists(a.value));
  expect(missing.map((a) => `${a.flow}: #${a.value}`)).toEqual([]);
});

it('every text a flow looks for matches, as Maestro matches, a text in the app', () => {
  const missing = FLOWS.flatMap((f) => f.asks)
    .filter((a) => a.kind === 'text' && !a.value.includes('${') && !textExists(a.value));
  expect(missing.map((a) => `${a.flow}: "${a.value}"`)).toEqual([]);
});

it('every flow drives this app, and none holds an account', () => {
  expect(FLOWS.filter((f) => f.config?.appId !== APP_ID).map((f) => f.flow)).toEqual([]);
  expect(FLOWS.filter((f) => /@[a-z0-9-]+\.[a-z]{2,}|password123/i.test(f.text)).map((f) => f.flow)).toEqual([]);
});

it('the detector says NO — to a dropped id, a dropped text, and a pattern that only half-matches', () => {
  expect(idExists('log-film-button')).toBe(false);
  expect(idExists('collection-card-watchlist')).toBe(true);
  expect(textExists('EDIT LOG')).toBe(false);
  expect(textExists('EDIT YOUR LOG')).toBe(true);
  // Maestro matches the WHOLE text: "MEMBERS ONLY" is not "[ MEMBERS ONLY ]".
  expect(textExists('MEMBERS ONLY')).toBe(false);
  expect(textExists('.*MEMBERS ONLY.*')).toBe(true);
  expect(textExists('(?i)edit your log')).toBe(true);
  expect(textExists('edit your log')).toBe(false);
});
