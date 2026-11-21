/**
 * A day is read on its own calendar: a date-only value is never read as an instant, an instant's day
 * is the member's, and a day of another year says its year.
 *
 * A calendar date (`2026-01-01`: a watched date, a release date, a day of a run) has no time and no
 * zone. Read as an instant it is midnight UTC, the evening before for every member west of UTC, so a
 * viewing on 1 January printed the year before (review round 14). An instant's day taken in UTC is
 * tomorrow for a member west of UTC by the evening (finding #40). A day the house takes from its own
 * clock (`current_date`) is UTC's, not the member's, so N NIGHTS RUNNING vanished each evening west of
 * UTC (review round 11). And a day printed without its year reads as this year's (review round 14).
 *
 * This finder reads every file of the app (the universe's appCode) and every function of the house
 * as production will hold it (houseFunctions), and refuses each shape unless it is listed below with
 * why the day there is the right one.
 */
import { readFileSync } from 'fs';
import ts from 'typescript';
import { codeOf, houseFunctions } from '@/test-utils/houseFunctions';
import { SNAPSHOT_SQL, PENDING_SQL } from '@/test-utils/schema';
import { files, rel } from '@/test-utils/universe';

/** The days the house and the catalogue write as `YYYY-MM-DD`, besides the schema's `date` columns. */
const OUTSIDE_DAYS = [
  'release_date', 'first_air_date', 'air_date', 'birthday', 'deathday', // TMDB's days
  'ends_on', // get_user_stats' current_run: the last night of a run
  'on_day', 'before_day',
];

/** Every name a day goes by: the schema's `date` columns and arguments, and the days above, in snake and camel case. */
export function dayNames(sql: string): Set<string> {
  const names = new Set<string>(OUTSIDE_DAYS);
  for (const m of sql.matchAll(/(?:^|[\s(,])"?([a-z_][a-z0-9_]*)"? date(?=[\s,)]|$)/gm)) {
    const name = (m[1] ?? '').replace(/^p_/, '');
    if (!['returns', 'as', 'default', 'and', 'or', 'then', 'else', 'to', 'is'].includes(name)) names.add(name);
  }
  for (const n of [...names]) names.add(n.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()));
  return names;
}

/** The name an expression's value goes by: its last identifier, through `?.`, `!`, `as` and `??`. */
function nameOf(e: ts.Expression): string | null {
  let x: ts.Expression = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x) || ts.isAsExpression(x)) x = x.expression;
    else if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) x = x.left;
    else break;
  }
  if (ts.isIdentifier(x)) return x.text;
  if (ts.isPropertyAccessExpression(x)) return x.name.text;
  if (ts.isElementAccessExpression(x) && ts.isStringLiteral(x.argumentExpression)) return x.argumentExpression.text;
  return null;
}

const READERS_OF_AN_INSTANT = new Set(['dateOf', 'instantOf']);

/** Each site in one file's text: a day read as an instant, an instant's UTC day, a day without its year. */
export function daySites(file: string, text: string, days: Set<string>): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const at = (n: ts.Node, what: string) => out.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}  ${what}  ${n.getText(sf).replace(/\s+/g, ' ').slice(0, 90)}`);
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const callee = n.expression;
      const arg = n.arguments?.[0];
      const named = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) ? `${callee.expression.text}.${callee.name.text}` : '';
      const readsAnInstant = (ts.isNewExpression(n) && named === 'Date' && n.arguments?.length === 1) || READERS_OF_AN_INSTANT.has(named) || named === 'Date.parse';
      if (readsAnInstant && arg) {
        const name = nameOf(arg);
        if (name && days.has(name)) at(n, 'a day read as an instant');
      }
      // toISOString() cut to its first ten: the day in UTC, not the member's.
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(callee) && ['slice', 'substring', 'substr', 'split'].includes(callee.name.text)) {
        const inner = callee.expression;
        if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression) && ['toISOString', 'toJSON'].includes(inner.expression.name.text)) {
          const a = n.arguments.map((x) => x.getText(sf)).join(',');
          if (/^0,\s*10$/.test(a) || /^['"]T['"]$/.test(a)) at(n, "an instant's day taken in UTC");
        }
      }
      if (named === 'formatDateMonthDay') at(n, 'a day said without its year');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * The places a shape stands where the day is the right one, each with why. A site is matched by its
 * file and the shape, so a new site of the shape in the same file is judged again only if it is another shape.
 */
const JUDGED: Record<string, string> = {
  "src/components/lobby/wallRead.ts  an instant's day taken in UTC":
    "the Lobby's edition is the house's UTC day for every member alike: lobby_choose_edition chooses each edition on the UTC day, and the wall asks for that edition (proof: wallRead.test.ts)",
  'src/components/film/watchedLabel.ts  a day said without its year':
    'said only when the calendar date\'s own year is this year (parts.year === thisYear); another year prints the year (proof: aViewingOnNewYearsDayKeepsItsYear.test.ts)',
  'app/dispatch/compose.tsx  a day said without its year':
    "the day a filing is being written: today on the member's clock, which is this year by definition",
};

/** SQL that takes a day from the house's clock or from an instant. */
const HOUSE_DAY = /\bcurrent_date\b|\bnow\(\)\s*::\s*date\b|\blocaltimestamp\b|\)\s*::\s*date\b|\bcreated_at\s*::\s*date\b|\bdate_trunc\(\s*'day'/gi;

/** Each function that takes a day from the house's clock or an instant, and why that day is the right one. */
const HOUSE_DAY_IS_THE_HOUSES = "the house's own day, the same for every member: no member's day is drawn from it";
const PACE_DAY = "a pace's day: the count restarts at the house's midnight for everyone, and the wait is said as a length of time, never as a day";
const NO_ZONE = "a record with no watched date falls back to the UTC day it was made, the only day the house knows (it holds no member's zone); every phone write names the member's own day (logOperations: watchedDate ?? localCalendarDate()), so only rows written before that fall back";
const HOUSE_DAYS_JUDGED: Record<string, string> = {
  'a_rank_is_counted(text, text)': `the sales count's day: ${HOUSE_DAY_IS_THE_HOUSES}`,
  'record_gate_event(text, text, text, text)': `the sales count's day and its salt: ${HOUSE_DAY_IS_THE_HOUSES}`,
  'get_lobby()': "the Lobby's edition is chosen on the house's UTC day, one wall for every member (lobby_choose_edition)",
  'analytics_events_daily_ceiling()': PACE_DAY,
  'lounge_messages_daily_ceiling()': PACE_DAY,
  'check_critique_pace()': PACE_DAY,
  'check_interaction_rate_limit()': PACE_DAY,
  'calendar_days(uuid)': "only the window read: the house's day less 364 to the house's day plus 1 holds every member's 52 weeks (today less 363) in any zone, west of UTC or east; the days drawn are the viewings' own",
  'log_viewing_add(uuid, uuid, jsonb)': "the default for a viewing given no day, which no phone sends: the rewatch names the member's own day (logOperations: watchedDate ?? localCalendarDate())",
  'get_user_analytics(uuid)': `current_streak (for older builds) and the newest run are chosen around the house's day with a day either side, and the phone judges the run on its own calendar (runStillStanding); and ${NO_ZONE}`,
  'get_public_profile_analytics(uuid)': NO_ZONE,
  'member_viewings(uuid)': NO_ZONE,
};

/** Each house function that takes a day from the house's clock, as name: the shape found. */
export function houseDaySites(fns: { name: string; types: string; body: string }[]): string[] {
  const out: string[] = [];
  for (const f of fns) {
    const code = codeOf(f.body).replace(/'[^']*'/g, "''");
    const shapes = [...new Set([...code.matchAll(HOUSE_DAY)].map((m) => m[0].replace(/\s+/g, ' ').toLowerCase()))];
    if (shapes.length) out.push(`${f.name}(${f.types}): ${shapes.join(' | ')}`);
  }
  return out;
}

const SQL = SNAPSHOT_SQL() + '\n' + PENDING_SQL();

describe('a day is read on its own calendar', () => {
  it('in the app: no day read as an instant, no instant\'s day taken in UTC, no day without its year, but where judged', () => {
    const days = dayNames(SQL);
    expect(days.has('watched_date') && days.has('watchedDate') && days.has('release_date')).toBe(true);
    const roots = files('appCode', { ext: ['.ts', '.tsx'] });
    expect(roots.length).toBeGreaterThan(300);
    const sites = roots.flatMap((p) => daySites(rel(p).replace(/^mobile\//, ''), readFileSync(p, 'utf8'), days));
    const unjudged = sites.filter((s) => !JUDGED[s.replace(/:\d+ {2}(.*?) {2}.*$/, '  $1')]);
    expect(unjudged).toEqual([]);
    // A judged place that no longer holds its shape is let go.
    const held = new Set(sites.map((s) => s.replace(/:\d+ {2}(.*?) {2}.*$/, '  $1')));
    expect(Object.keys(JUDGED).filter((k) => !held.has(k))).toEqual([]);
  });

  it('in the house: no day taken from the house\'s clock or from an instant, but where judged', () => {
    const fns = houseFunctions();
    expect(fns.length).toBeGreaterThan(150);
    const sites = houseDaySites(fns);
    expect(sites.filter((s) => !HOUSE_DAYS_JUDGED[s.split(':')[0] ?? ''])).toEqual([]);
    expect(Object.keys(HOUSE_DAYS_JUDGED).filter((k) => !sites.some((s) => s.startsWith(`${k}:`)))).toEqual([]);
  });

  it('finds each planted shape, and passes the right reads', () => {
    const days = dayNames('CREATE TABLE public.logs (\n    watched_date date,\n    created_at timestamp with time zone\n);');
    const planted = [
      'const a = dateOf(log.watchedDate).getFullYear();',
      'const b = new Date(row.watched_date);',
      'const c = instantOf(film.release_date ?? null);',
      'const d = Date.parse(film.releaseDate!);',
      'const e = new Date().toISOString().slice(0, 10);',
      "const f = when.toISOString().split('T')[0];",
      'const g = formatDateMonthDay(post.createdAt);',
      // The right reads: a moment read as one, a day read by its parts, the member's own day.
      'const h = dateOf(log.created_at);',
      'const i = dateParts(log.watchedDate);',
      'const j = localCalendarDate();',
      'const k = formatDateMonthDayInYear(post.createdAt, now);',
      'const l = new Date(ms);',
    ].join('\n');
    expect(daySites('planted.ts', planted, days).map((s) => s.replace(/^planted\.ts:(\d+) {2}(.*?) {2}.*$/, '$1 $2'))).toEqual([
      '1 a day read as an instant',
      '2 a day read as an instant',
      '3 a day read as an instant',
      '4 a day read as an instant',
      "5 an instant's day taken in UTC",
      "6 an instant's day taken in UTC",
      '7 a day said without its year',
    ]);
  });

  it('finds the house taking its own day, in each form, and not a day it was given', () => {
    const body = (b: string) => [{ name: 'f', types: '', body: b }];
    expect(houseDaySites(body('SELECT 1 WHERE d >= CURRENT_DATE - 1'))).toEqual(['f(): current_date']);
    expect(houseDaySites(body('v := now()::date;'))).toEqual(['f(): now()::date']);
    expect(houseDaySites(body("v := (now() AT TIME ZONE 'UTC')::date;"))).toEqual(['f(): )::date']);
    expect(houseDaySites(body('SELECT l.created_at::date FROM logs l'))).toEqual(['f(): created_at::date']);
    expect(houseDaySites(body('-- current_date in a comment\nSELECT p_day + 1'))).toEqual([]);
    expect(houseDaySites(body("SELECT 'current_date'"))).toEqual([]);
  });

  it('reads the house as production will hold it: a pending migration replaces the snapshot\'s function', () => {
    const fns = houseFunctions();
    // get_user_analytics is the snapshot's, replaced by a pending migration; each name is held once per list of types.
    expect(fns.find((f) => f.name === 'get_user_analytics')?.from).toBe('pending');
    expect(fns.find((f) => f.name === 'log_viewing_add')?.from).toBe('snapshot');
    const keys = fns.map((f) => `${f.name}(${f.types})`);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});
