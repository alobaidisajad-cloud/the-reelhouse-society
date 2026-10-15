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
  const scrolls: Record<string, unknown>[] = [];
  const visit = (step: unknown): void => {
    if (!step || typeof step !== 'object') return;
    for (const [cmd, arg] of Object.entries(step as Record<string, unknown>)) {
      if (cmd === 'scrollUntilVisible') scrolls.push(arg && typeof arg === 'object' ? arg as Record<string, unknown> : {});
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
  return { flow, config: config as { appId?: string }, asks, scrolls, text: readFileSync(file, 'utf8') };
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

// A page's last line, only reached, never tapped: it cannot come to the middle (run 38663626040).
const END_OF_PAGE = ['The projection booth never closes.'];

it('every scroll to something tapped brings it to the middle, with time to get there', () => {
  // A scroll that stops as soon as its target shows can leave it under the
  // docked tab bar, and the next tap lands on a tab: browse_vault opened the
  // Reel instead of the Watchlist on a slow run. Each centring swipe takes
  // seconds there, and 20 s ran out after one (log_film_flow, 38663626040).
  const scrolls = FLOWS.flatMap((f) => f.scrolls.map((arg) => ({ flow: f.flow, arg, end: END_OF_PAGE.includes(String(arg.element)) })));
  expect(scrolls.length).toBeGreaterThanOrEqual(3);
  const centred = scrolls.filter((s) => !s.end);
  expect(centred.filter((s) => s.arg.centerElement !== true || Number(s.arg.timeout) < 60000).map((s) => s.flow)).toEqual([]);
  // The named exceptions exist, and are not centred.
  expect(scrolls.filter((s) => s.end).map((s) => [s.flow, s.arg.centerElement ?? false]))
    .toEqual(END_OF_PAGE.map(() => ['lobby_wall_flow.yaml', false]));
});

it('no flow line is over 80 characters, as the flow lint in CI requires (yamllint, relaxed)', () => {
  const long = FLOWS.flatMap((f) => f.text.split(/\r?\n/).map((l, i) => ({ at: `${f.flow}:${i + 1}`, n: [...l].length })))
    .filter((l) => l.n > 80);
  expect(long.map((l) => `${l.at} (${l.n})`)).toEqual([]);
});

it('every flow drives this app, and none holds an account', () => {
  expect(FLOWS.filter((f) => f.config?.appId !== APP_ID).map((f) => f.flow)).toEqual([]);
  expect(FLOWS.filter((f) => /@[a-z0-9-]+\.[a-z]{2,}|password123/i.test(f.text)).map((f) => f.flow)).toEqual([]);
});

// ── A tab is asked for what only its loaded content carries ──────────────────
// Build 41's Dispatch failed every read, and every run stayed green: its flow
// asked for `dispatch-tab`, which a tab that could not read shows too. So after
// a tab is tapped, before anything else, one of its loaded testIDs is looked
// for, as a guest or (from the sign-in's submit) a member. Each is set only in
// a tree a read drew (feedScreen.test.tsx, theWallHasNoDeadEnds.test.tsx).
const LOADED: Record<string, { guest: string[]; member: string[] }> = {
  'dispatch-tab': { guest: ['dispatch-filing'], member: ['dispatch-filing'] },
  'reels-tab': { guest: ['reel-log'], member: ['reel-log'] },
  'home-tab': { guest: ['welcome-seek-admission'], member: ['lobby-wall-hung'] },
  'darkroom-tab': { guest: ['film-card'], member: ['film-card'] },
  'profile-tab': { guest: ['profile-sign-in-prompt'], member: ['collection-card-watchlist'] },
};

type Step = { cmd: string; arg: unknown; inRepeat: boolean };

/** A flow's steps in the order Maestro runs them, its subflows' steps in place. */
const stepsOf = (file: string, inRepeat = false): Step[] => {
  const [, steps] = parseAllDocuments(readFileSync(file, 'utf8')).map((d) => d.toJS());
  const out: Step[] = [];
  const add = (step: unknown, rep: boolean): void => {
    if (!step || typeof step !== 'object') { if (typeof step === 'string') out.push({ cmd: step, arg: null, inRepeat: rep }); return; }
    for (const [cmd, arg] of Object.entries(step as Record<string, unknown>)) {
      if (cmd === 'runFlow') {
        const sub = typeof arg === 'string' ? arg : (arg as { file: string }).file;
        out.push(...stepsOf(join(file, '..', sub), rep));
      } else if (cmd === 'repeat') {
        ((arg as { commands?: unknown[] }).commands ?? []).forEach((c) => add(c, true));
      } else out.push({ cmd, arg, inRepeat: rep });
    }
  };
  (Array.isArray(steps) ? steps : []).forEach((s) => add(s, inRepeat));
  return out;
};

/** The id a step looks for: an assertion, a wait, a scroll to it, or a tap on it. */
const lookedFor = (s: Step): string | null => {
  const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null);
  if (s.cmd === 'assertVisible' || s.cmd === 'tapOn') return idOf(s.arg);
  if (s.cmd === 'extendedWaitUntil') return idOf((s.arg as { visible?: unknown })?.visible);
  if (s.cmd === 'scrollUntilVisible') return idOf((s.arg as { element?: unknown })?.element);
  return null;
};
/** Steps that only look, and change nothing on the screen. */
const LOOKS = ['assertVisible', 'assertNotVisible', 'extendedWaitUntil', 'waitForAnimationToEnd'];

/** Each tab a flow opens and leaves unproved, as `flow: tab (why)`. */
const unprovenTabs = (flow: string, steps: Step[]): string[] => {
  const faults: string[] = [];
  let who: 'guest' | 'member' = 'guest';
  const proven = new Set<string>();
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.cmd === 'launchApp' && (s.arg as { clearState?: boolean } | null)?.clearState) { who = 'guest'; proven.clear(); }
    if (s.cmd === 'tapOn' && lookedFor(s) === 'sign-in-submit') { who = 'member'; proven.clear(); }
    const tab = s.cmd === 'tapOn' ? lookedFor(s) : null;
    if (!tab || !LOADED[tab]) continue;
    const wanted = LOADED[tab][who];
    // A stress test switches before content arrives, on purpose: the same tab's
    // content must already have been shown in this flow, as this person.
    if (s.inRepeat) { if (!proven.has(tab)) faults.push(`${flow}: ${tab} (tapped in a repeat, never shown loaded)`); continue; }
    let j = i + 1;
    while (j < steps.length && LOOKS.includes(steps[j].cmd) && !wanted.includes(lookedFor(steps[j]) ?? '')) j++;
    if (j < steps.length && wanted.includes(lookedFor(steps[j]) ?? '')) proven.add(tab);
    else faults.push(`${flow}: ${tab} (as a ${who}, wants one of ${wanted.join(', ')})`);
  }
  return faults;
};

const ROOT_FLOWS = FILES.filter((f) => !relative(FLOW_DIR, f).split('\\').join('/').startsWith('subflows/'));

it('every flow that opens a tab looks for what only its loaded content carries, before anything else', () => {
  // The tab bar's own five, so a new tab cannot be opened unasked.
  const tabs = [...readFileSync(join(MOBILE, 'app', '(tabs)', '_layout.tsx'), 'utf8').matchAll(/tabBarButtonTestID:\s*'([^']+)'/g)].map((m) => m[1]);
  expect(Object.keys(LOADED).sort()).toEqual(tabs.sort());
  for (const ids of Object.values(LOADED)) for (const id of [...ids.guest, ...ids.member]) expect(`${id}: ${idExists(id)}`).toBe(`${id}: true`);
  const faults = ROOT_FLOWS.flatMap((f) => unprovenTabs(relative(FLOW_DIR, f).split('\\').join('/'), stepsOf(f)));
  expect(faults).toEqual([]);
  // It read the flows: the five tabs are each opened somewhere.
  const opened = new Set(ROOT_FLOWS.flatMap((f) => stepsOf(f)).filter((s) => s.cmd === 'tapOn').map(lookedFor));
  expect(Object.keys(LOADED).filter((t) => !opened.has(t))).toEqual([]);
});

it('the tab check says NO — to the tab bar as proof, to a tap before the content, to a repeat never shown', () => {
  const tap = (id: string): Step => ({ cmd: 'tapOn', arg: { id }, inRepeat: false });
  const see = (id: string): Step => ({ cmd: 'assertVisible', arg: { id }, inRepeat: false });
  // The build 41 flow: the Dispatch "proved" by its own tab button.
  expect(unprovenTabs('x', [tap('dispatch-tab'), see('dispatch-tab')])).toEqual(['x: dispatch-tab (as a guest, wants one of dispatch-filing)']);
  // Looked for, but only after the search was already typed into.
  expect(unprovenTabs('x', [tap('darkroom-tab'), tap('darkroom-search-input'), see('film-card')])).toHaveLength(1);
  // A member's Lobby is not the welcome.
  expect(unprovenTabs('x', [tap('sign-in-submit'), tap('home-tab'), see('welcome-seek-admission')])).toHaveLength(1);
  expect(unprovenTabs('x', [{ ...tap('home-tab'), inRepeat: true }])).toEqual(['x: home-tab (tapped in a repeat, never shown loaded)']);
  // And yes, to a tab whose content is looked for, other looks between.
  expect(unprovenTabs('x', [tap('home-tab'), { cmd: 'assertVisible', arg: 'The Lobby', inRepeat: false }, see('welcome-seek-admission')])).toEqual([]);
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
