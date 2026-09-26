/**
 * The committed snapshot of production — what it must hold, and what it must not.
 * ─────────────────────────────────────────────────────────────────────────────
 * `npm run schema:check` compares production against these files, and the
 * sealed E2E world is built from them, so they have to be complete: a
 * `pg_dump -n public` alone misses the triggers on auth.users that make and
 * erase a profile, the upload rules on storage.objects, and the tables live
 * updates are sent for. And the repo is public, so they must never hold a key.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const { findSecret } = require('../../../scripts/secret-shapes.cjs') as {
  findSecret: (text: string) => { shape: string; line: number } | null;
};

const DIR = join(__dirname, '..', '..', '..', 'supabase', 'schema');
const read = (f: string) => readFileSync(join(DIR, f), 'utf8');
const FILES = ['live-extensions.sql', 'live-schema.sql', 'live-outside-public.sql'];

it('carries no line ending the host added — on Windows every \\n psql prints arrives as \\r\\n', () => {
  // The two small files are all our own SQL: no CR at all.
  expect(['live-extensions.sql', 'live-outside-public.sql'].map((f) => [f, read(f).includes('\r')]))
    .toEqual([['live-extensions.sql', false], ['live-outside-public.sql', false]]);
  // The dump may hold a real CR inside a function body (saved with CRLF), so
  // look only at lines pg_dump itself writes: its object headers.
  const headers = read('live-schema.sql').split('\n').filter((l) => /^-- Name: .*; Type: /.test(l));
  expect(headers.length).toBeGreaterThan(100);
  expect(headers.filter((l) => l.endsWith('\r'))).toEqual([]);
});

it('holds no key or token', () => {
  expect(FILES.map((f) => [f, findSecret(read(f))])).toEqual(FILES.map((f) => [f, null]));
});

it('the key detector says YES to each shape, and NO to SQL that only builds a header', () => {
  // Built at run time, so this file is not itself a string a scanner would flag.
  const planted = [
    `'Authorization', 'Bearer ${'x'.repeat(24)}'`,
    `key := 'eyJ${'a'.repeat(16)}.${'b'.repeat(16)}.c';`,
    `'${['sk', 'live', 'a1b2c3d4e5f6'].join('_')}'`,
    `'${['sb', 'secret', 'a1b2c3d4e5f6'].join('_')}'`,
    `'${['re', 'a1b2c3d4e5', 'f6g7h8i9j0'].join('_')}'`,
  ];
  expect(planted.map((p) => !!findSecret(p))).toEqual(planted.map(() => true));
  expect(findSecret("headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret);")).toBeNull();
  expect(findSecret(`one\n${planted[0]}`)?.line).toBe(2);
});

it('sees outside public — the parts pg_dump -n public cannot', () => {
  const outside = read('live-outside-public.sql');
  expect(outside).toMatch(/^CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth\.users .* public\.handle_new_user\(\);$/m);
  expect(outside).toMatch(/^CREATE TRIGGER on_auth_user_deleted BEFORE DELETE ON auth\.users /m);
  expect(outside).toMatch(/^CREATE EVENT TRIGGER ensure_rls /m);
  expect(outside).toMatch(/^ALTER PUBLICATION supabase_realtime ADD TABLE public\.notifications;$/m);
  expect(outside).toMatch(/^INSERT INTO storage\.buckets .* VALUES \('avatars', /m);
  // An INSERT rule's whole condition is its WITH CHECK — the old text snapshot
  // printed "-" for it. So every one must carry it.
  const inserts = outside.split('\n').filter((l) => / FOR INSERT TO /.test(l));
  expect(inserts.length).toBeGreaterThan(0);
  expect(inserts.filter((l) => !/ WITH CHECK \(.+\);$/.test(l))).toEqual([]);
  expect(outside).toMatch(/^SELECT cron\.schedule_in_database\('freeze-closed-ballots', /m);
  expect(read('live-extensions.sql')).toMatch(/^CREATE EXTENSION IF NOT EXISTS pg_cron /m);
});

/**
 * Storage rules are ORed, so ONE loose rule opens what every strict one closes.
 * That is how an extension check never bound: a looser twin let any name
 * through. And a rule for visitors let anyone list every avatar folder — every
 * member id. A public bucket needs no rule to SHOW a file; rules only govern
 * the API, and every act there is a member's, in their own folder.
 */
it('every storage rule is for signed-in members, in their own folder — and a write keeps an image extension', () => {
  const rules = read('live-outside-public.sql').split('\n').filter((l) => / ON storage\.objects /.test(l));
  expect(rules.length).toBeGreaterThanOrEqual(4);
  const own = /\(storage\.foldername\(name\)\)\[1\] = \(\( SELECT auth\.uid\(\) AS uid\)\)::text/;
  expect(rules.filter((l) => !/ TO authenticated /.test(l) || !own.test(l))).toEqual([]);
  const writes = rules.filter((l) => / FOR (INSERT|UPDATE) /.test(l));
  expect(writes.filter((l) => !/ WITH CHECK \(.*name ~\* /.test(l))).toEqual([]);
});

it('each file says where it runs in the build order', () => {
  expect(read('live-extensions.sql')).toContain('Run FIRST: live-extensions.sql, then live-schema.sql, then live-outside-public.sql.');
  expect(read('live-outside-public.sql')).toContain('Run LAST, after live-schema.sql.');
});
