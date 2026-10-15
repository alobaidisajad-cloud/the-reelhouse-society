/**
 * theLineEndsChangeNoFunction.guard.test.ts — no carriage return in production's
 * functions changes what one does.
 *
 * Migrations applied from a Windows checkout left CRLF in the bodies they made
 * (.gitattributes now keeps every applied file LF). Between statements a CR is
 * whitespace, and the undo check (e2e/db/up-down-up.mjs) compares schemas with
 * line ends taken off. That is sound only while no CR sits inside quoted text,
 * where it would be part of a value, unless the text is read as JSON, where it
 * is whitespace again. Read from the committed snapshot, as production has it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { MOBILE } from '@/test-utils/readCode';
import { files as universe, repoRel } from '@/test-utils/universe';

/** Each function body in a schema dump, with its name. */
function bodies(sql: string): { name: string; body: string }[] {
  return [...sql.matchAll(/CREATE FUNCTION (public\.\w+)\([^]*?AS \$(\w*)\$([^]*?)\$\2\$/g)].map((m) => ({ name: m[1]!, body: m[3]! }));
}

/** Each quoted text in a body that holds a CR and is not read as JSON, as `name: text`. */
function crInText(sql: string): string[] {
  return bodies(sql).flatMap(({ name, body }) => {
    const code = body.replace(/--[^\n]*/g, '');
    return [...code.matchAll(/'((?:[^']|'')*)'(::jsonb?\b)?/g)]
      .filter((m) => m[1]!.includes('\r') && !m[2])
      .map((m) => `${name}: ${JSON.stringify(m[1]!.slice(0, 60))}`);
  });
}

const SNAPSHOT = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'latin1');

it('reads production\'s functions, CRLF bodies among them', () => {
  const all = bodies(SNAPSHOT);
  expect(all.length).toBeGreaterThan(100);
  expect(all.filter((b) => b.body.includes('\r')).length).toBeGreaterThan(10);
});

it('finds no carriage return inside any quoted text but JSON', () => {
  expect(crInText(SNAPSHOT)).toEqual([]);
});

it('every file the train applies or rehearses is LF on this checkout: production gets the bytes CI ran', () => {
  const applied = universe(['migrations', 'undo', 'rehearsals']);
  expect(applied.length).toBeGreaterThan(30);
  expect(applied.filter((f) => readFileSync(f, 'latin1').includes('\r')).map(repoRel)).toEqual([]);
});

it('can say no: a CR in a text a function returns, and not in JSON or between statements', () => {
  const fn = (body: string) => `CREATE FUNCTION public.f() RETURNS text\n    LANGUAGE sql\n    AS $$${body}$$;\n`;
  expect(crInText(fn("SELECT 'a\r\nb'"))).toEqual(['public.f: "a\\r\\nb"']);
  expect(crInText(fn("SELECT '{\r\n\"a\": 1}'::jsonb"))).toEqual([]);
  expect(crInText(fn("SELECT 1\r\n  + 1"))).toEqual([]);
});
