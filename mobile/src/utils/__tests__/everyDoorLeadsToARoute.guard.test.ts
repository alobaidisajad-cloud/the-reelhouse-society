/**
 * everyDoorLeadsToARoute.guard.test.ts — every place the app navigates to is a
 * screen app/ has.
 *
 * nav.push takes any string, and route types are not part of CI's type check,
 * so a mistyped path compiled and failed only when a member pressed it. Every
 * target written in the code (a call to nav or the router, or a Link's href)
 * is read with TypeScript's parser and matched against the routes Expo Router
 * makes of app/'s files: groups like (tabs) are not in the path, index is the
 * folder itself, [id] matches one segment, and a template's ${...} stands in
 * for one. A target worked out at run time (a variable, a helper's answer) is
 * listed in COMPUTED with where it comes from, so a new one is read, not missed.
 */
import ts from 'typescript';
import { readFileSync } from 'fs';
import { join } from 'path';
import { files as universe, rel } from '@/test-utils/universe';

const MOBILE = join(__dirname, '..', '..', '..');
/** The app's code, where a target is written. */
const files = universe('appCode', { ext: ['.ts', '.tsx'] }).filter((f) => !f.endsWith('.d.ts')).map(rel);

/** Each route, as segments: a literal, or null for one dynamic segment; a catch-all is '*'. */
const routes = universe('routes', { ext: ['.ts', '.tsx'] }).map(rel).filter((f) => !/(^|\/)(_layout|\+[\w-]+)\.tsx?$/.test(f)).map((f) =>
  f.replace(/^app\//, '').replace(/\.tsx?$/, '').split('/')
    .filter((s) => !/^\(.*\)$/.test(s) && s !== 'index')
    .map((s) => (/^\[\.\.\..+\]$/.test(s) ? '*' : /^\[.+\]$/.test(s) ? null : s)));

/** A target's path, as segments: a literal, or null where a template's ${...} stands. */
const HOLE = '\u0000';
const segmentsOf = (path: string) => (path.split(/[?#]/)[0] ?? '').split('/').filter(Boolean)
  .filter((s) => !/^\(.*\)$/.test(s)).map((s) => (s.includes(HOLE) ? null : s));

export const isRoute = (path: string) => {
  const t = segmentsOf(path);
  return routes.some((r) => {
    if (r.includes('*')) return t.length >= r.indexOf('*') && r.slice(0, r.indexOf('*')).every((s, i) => s === null || s === t[i]);
    return r.length === t.length && r.every((s, i) => (s === null ? t[i] !== '' : t[i] === null ? false : s === t[i]));
  });
};

const CALLS = /^(nav|router)\.(push|replace|navigate|dismissTo)$/;
type Target = { at: string; text: string; paths: string[] | null };

/** The paths an expression can be: each branch of a conditional, through casts and brackets; null when worked out at run time. */
function pathsOf(e: ts.Expression): string[] | null {
  if (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) return pathsOf(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isTemplateExpression(e)) {
    // A template that is only its holes (`/${tab}`) writes no path of its own.
    if (!/[^/]/.test(e.head.text + e.templateSpans.map((s) => s.literal.text).join(''))) return null;
    return [e.head.text + e.templateSpans.map((s) => HOLE + s.literal.text).join('')];
  }
  if (ts.isConditionalExpression(e)) {
    const a = pathsOf(e.whenTrue); const b = pathsOf(e.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  if (ts.isObjectLiteralExpression(e)) {
    const p = e.properties.find((x) => ts.isPropertyAssignment(x) && x.name.getText() === 'pathname') as ts.PropertyAssignment | undefined;
    return p ? pathsOf(p.initializer) : null;
  }
  return null;
}

function targets(): Target[] {
  const out: Target[] = [];
  for (const f of files) {
    const sf = ts.createSourceFile(f, readFileSync(join(MOBILE, f), 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      let arg: ts.Expression | undefined;
      if (ts.isCallExpression(n) && CALLS.test(n.expression.getText())) arg = n.arguments[0];
      if (ts.isJsxAttribute(n) && n.name.getText() === 'href' && n.initializer) {
        arg = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
      }
      if (arg) out.push({ at: f, text: arg.getText().replace(/\s+/g, ' '), paths: pathsOf(arg) });
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

/** Targets worked out at run time, by file and their own text, each with where its path comes from. */
const COMPUTED: { at: string; text: string; from: string }[] = [
  { at: 'app/(admin)/tribunal.tsx', text: 'ev.data!.route!', from: 'the reported item\'s page, as the server\'s get_report_evidence names it' },
  { at: 'app/(modals)/notifications-modal.tsx', text: 'route as never', from: 'noticeRoute (a notice) or groupRoute (a group of certifications): checked below' },
  { at: 'app/(modals)/search-modal.tsx', text: 'r._nav', from: 'each result\'s _nav, written beside its kind in useUniversalSearch: checked below' },
  { at: 'app/(tabs)/_layout.tsx', text: '`/${tab}` as Href', from: 'tabToReopen: a name from lastTab.ts\'s TABS, never index: checked below' },
  { at: 'app/auth-callback.tsx', text: 'to', from: 'goOnward\'s two callers: /reset-password and /(tabs): checked below' },
  { at: 'app/dispatch/[id].tsx', text: 'roomOf(username)', from: 'roomOf: checked below' },
  { at: 'app/dispatch/series/[id].tsx', text: 'roomOf(author.name)', from: 'roomOf: checked below' },
  { at: 'src/components/dispatch/FilingRow.tsx', text: 'roomOf(authorName)', from: 'roomOf: checked below' },
  { at: 'src/components/layout/ConciergeButton.tsx', text: 'route', from: 'handleAction\'s callers: /log-modal, /list-modal, /dispatch/compose: checked below' },
  { at: 'src/utils/openNoticeFromPush.ts', text: 'route', from: 'noticeRoute, or the notices sheet: checked below' },
];

it('reads the routes app/ makes and the targets the code writes', () => {
  expect(routes.length).toBeGreaterThan(30);
  const all = targets();
  expect(all.length).toBeGreaterThan(120);
  expect(all.filter((t) => t.paths).length).toBeGreaterThan(100);
});

it('sends every written target to a screen app/ has', () => {
  const nowhere = targets().flatMap((t) => (t.paths ?? []).filter((p) => !isRoute(p)).map((p) => `${t.at}: ${p.split(HOLE).join('${…}')}`));
  expect(nowhere).toEqual([]);
});

it('names where every target worked out at run time comes from, and nothing more', () => {
  const computed = targets().filter((t) => !t.paths).map((t) => `${t.at} ${t.text}`);
  const listed = COMPUTED.map((c) => `${c.at} ${c.text}`);
  expect(computed.filter((c) => !listed.includes(c))).toEqual([]);
  expect(listed.filter((c) => !computed.includes(c))).toEqual([]);
});

it('the helpers that work a target out answer with screens app/ has', () => {
  const { noticeRoute } = require('@/src/utils/noticeRoute') as typeof import('@/src/utils/noticeRoute');
  const { groupRoute } = require('@/src/utils/endorsementGroupKey') as typeof import('@/src/utils/endorsementGroupKey');
  const { roomOf } = require('@/src/components/dispatch/roomLink') as typeof import('@/src/components/dispatch/roomLink');
  const { TABS } = require('@/src/utils/lastTab') as typeof import('@/src/utils/lastTab');
  const id = '11111111-1111-4111-8111-111111111111';
  const made = [
    ...['log', 'list', 'post'].map((k) => noticeRoute({ group_key: `lobby:${k}:${id}` })),
    ...(['log', 'list', 'post', 'dossier'] as const).map((kind) => groupRoute({ kind, id })),
    noticeRoute({ film_id: 603 }),
    noticeRoute({ from_username: 'kane' }),
    roomOf('kane'), roomOf('a name with spaces'),
    ...TABS.filter((t) => t !== 'index').map((t) => `/${t}`),
    '/reset-password', '/(tabs)', '/log-modal', '/list-modal', '/dispatch/compose',
  ];
  // The search's results, each kind's _nav as its hook writes it.
  const search = [...readFileSync(join(MOBILE, 'src/hooks/useUniversalSearch.ts'), 'utf8').matchAll(/_nav: `([^`]+)`/g)]
    .map((m) => (m[1] ?? '').replace(/\$\{[^}]+\}/g, HOLE));
  expect(search.length).toBeGreaterThanOrEqual(3);
  expect([...made, ...search].filter((p) => !p || !isRoute(p))).toEqual([]);
  expect(made.length).toBeGreaterThan(15);
});

it('can say no: a path no file makes, a dynamic segment too many, a group name kept out of the match', () => {
  expect(isRoute('/film/603')).toBe(true);
  expect(isRoute(`/film/${HOLE}`)).toBe(true);
  expect(isRoute('/film/603/cast')).toBe(false);
  expect(isRoute('/films')).toBe(false);
  expect(isRoute('/(tabs)/dispatch')).toBe(true);
  expect(isRoute('/dispatch?tab=archive')).toBe(true);
});
