/**
 * routes.test.ts — the route walk's list (e2e/routes.json) is every route file in app/, layouts and
 * the not-found page aside, each with a deep link the walk can open: a path of its own, only the
 * placeholders the walk fills from the seeded world, and the seeded member unless it names a guest.
 * A route added to app/ fails here until it is listed.
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { files as universe } from '../../test-utils/universe';

const MOBILE = join(__dirname, '..', '..');
type Route = { link: string; as?: 'guest' | 'member'; why?: string; lands?: string; then?: string };
/** A control a moment taps, or what shows once it is there: by its id, or by the words it shows or is labelled. */
type Control = { id?: string; text?: string };
type Moment = { link: string; taps: Control[]; shows?: Control; part?: string; keyboard?: boolean; why?: string };
const LIST = JSON.parse(readFileSync(join(__dirname, '..', 'routes.json'), 'utf8')) as { routes: Record<string, Route>; moments: Record<string, Moment> };

/** The ids the walk reads back from the seeded world (e2e/walk-routes). */
const PLACEHOLDERS = ['filing', 'stack', 'log', 'lounge', 'series', 'dossier', 'film', 'person', 'member'];

/** Every screen expo-router opens: the route files, its layouts and its not-found page aside. */
const screens = universe('routes').map((f) => relative(MOBILE, f).split('\\').join('/'))
  .filter((f) => !/(^|\/)_layout\.tsx$/.test(f) && !/\+not-found\.tsx$/.test(f) && !/\+[a-z-]+\.tsx?$/.test(f));

it('lists every route file, and nothing that is not one', () => {
  expect(screens.length).toBeGreaterThan(30);
  expect(Object.keys(LIST.routes).sort()).toEqual([...screens].sort());
});

it('gives each a link of its own, with only the walk\'s placeholders, and the member unless a guest', () => {
  const wrong = Object.entries(LIST.routes).flatMap(([file, r]) => {
    const faults: string[] = [];
    if (!r.link.startsWith('/')) faults.push(`${file}: a link starts at /`);
    for (const m of r.link.matchAll(/\{([a-z]+)\}/g)) if (!PLACEHOLDERS.includes(m[1] ?? '')) faults.push(`${file}: {${m[1]}} is no id the walk reads`);
    if (r.as !== undefined && r.as !== 'guest') faults.push(`${file}: as is "guest" or left out`);
    // A tap after the link is the app's own design, and says which.
    if (r.then !== undefined && (r.why ?? '').length < 30) faults.push(`${file}: a then says why, in words`);
    // A route whose file takes an [id] opens with a seeded one.
    if (/\[[a-z]+\]\.tsx$/.test(file) && !/\{[a-z]+\}/.test(r.link)) faults.push(`${file}: an [id] route with no seeded id`);
    return faults;
  });
  expect(wrong).toEqual([]);
});

it('opens each link once: two files share one only when one redirects to the other, and says so', () => {
  const byLink = new Map<string, string[]>();
  for (const [file, r] of Object.entries(LIST.routes)) byLink.set(r.link, [...(byLink.get(r.link) ?? []), file]);
  const shared = [...byLink.values()].filter((files) => files.length > 1);
  for (const files of shared) {
    const aliases = files.filter((f) => /redirect/i.test(LIST.routes[f]?.why ?? '') && /<Redirect\b/.test(readFileSync(join(MOBILE, f), 'utf8')));
    expect([files, aliases.length]).toEqual([files, files.length - 1]);
  }
  expect(shared).toEqual([['app/(tabs)/lounge.tsx', 'app/lounge.tsx']]);
});

/** The parts of a screen e2e/grounds-judges.mjs knows (its PARTS, which groundsJudges.test.ts holds). */
const PARTS = ['above-keyboard'];
/** Every file of the app's code, read once: where a moment's controls must be drawn. */
const APP_CODE = universe('appCode').map((f) => readFileSync(f, 'utf8')).join('\n');
/**
 * Whether the app draws a control: its id or its words quoted in the app's code, or an id a template
 * makes (`film-act-${act.key}`) whose rest is itself a word the code holds ('log').
 */
const drawn = (c: Control): boolean => {
  const quoted = (w: string) => ['"', "'", '`'].some((q) => APP_CODE.includes(`${q}${w}${q}`));
  const id = c.id;
  if (id !== undefined) {
    const made = [...APP_CODE.matchAll(/`([a-z][a-z-]*-)\$\{/g)].some(([, start = '']) => id.startsWith(start) && quoted(id.slice(start.length)));
    return quoted(id) || made;
  }
  return quoted((c.text ?? '').replace(/\.\*$/, ''));
};

it('gives each moment a link of the walk\'s placeholders, its taps, what shows, its part and why; every control one the app draws', () => {
  const moments = Object.entries(LIST.moments);
  expect(moments.map(([name]) => name)).toEqual(['the sign-out alert', 'the keyboard', 'the calendar']);
  const wrong = moments.flatMap(([name, m]) => {
    const faults: string[] = [];
    if (!m.link.startsWith('/')) faults.push(`${name}: a link starts at /`);
    for (const p of m.link.matchAll(/\{([a-z]+)\}/g)) if (!PLACEHOLDERS.includes(p[1] ?? '')) faults.push(`${name}: {${p[1]}} is no id the walk reads`);
    if (m.taps.length === 0) faults.push(`${name}: at least one tap`);
    for (const c of [...m.taps, ...(m.shows ? [m.shows] : [])]) {
      if ((c.id === undefined) === (c.text === undefined)) faults.push(`${name}: a control by its id or by its words, one of the two`);
      else if (!drawn(c)) faults.push(`${name}: ${c.id ?? c.text} is drawn nowhere in the app`);
    }
    if (m.part !== undefined && !PARTS.includes(m.part)) faults.push(`${name}: no part named ${m.part}`);
    // The keyboard is on only where the screen is read above it, and read above it only where it is on.
    if ((m.keyboard === true) !== (m.part === 'above-keyboard')) faults.push(`${name}: the keyboard on, and read above it, together or neither`);
    if ((m.why ?? '').length < 30) faults.push(`${name}: says why, in words`);
    return faults;
  });
  expect(wrong).toEqual([]);
});
