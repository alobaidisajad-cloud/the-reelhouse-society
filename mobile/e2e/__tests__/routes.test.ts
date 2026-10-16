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
type Route = { link: string; as?: 'guest' | 'member'; why?: string };
const LIST = JSON.parse(readFileSync(join(__dirname, '..', 'routes.json'), 'utf8')) as { routes: Record<string, Route> };

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
