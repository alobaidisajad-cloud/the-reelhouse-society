/**
 * aReportIsFiledThroughOneDoor.test.ts — every report goes through submit_report.
 *
 * The Tribunal reads its docket most-reported first. Members held INSERT on
 * `reports`, the web's report button wrote it directly, and nothing refused a
 * second report of the same thing, so one member could raise anything to the
 * head of the docket. 20261001_03 closes the table to clients and holds one
 * pending report per member per thing; its rehearsal proves that on the
 * database (a_report_is_counted_once_rehearsal.sql). This holds the clients to
 * it, the app and the web alike, since they share the database.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { MOBILE, stripComments } from '@/test-utils/readCode';

const ROOT = join(MOBILE, '..');
const MIGRATION = readFileSync(join(ROOT, 'supabase', 'migrations', '20261001_03_a_report_is_counted_once.sql'), 'utf8');
const SNAPSHOT = readFileSync(join(MOBILE, 'supabase', 'schema', 'live-schema.sql'), 'utf8');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!['node_modules', '__tests__', 'dist', 'build'].includes(name)) sources(p, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

describe('a report is filed through one door', () => {
  const files = [
    ...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app')), ...sources(join(ROOT, 'src')),
  ];

  it('no client writes the reports table itself', () => {
    expect(files.length).toBeGreaterThan(500);
    const writes = files.filter((f) => /from\(\s*['"]reports['"]\s*\)\s*\.\s*(insert|update|upsert|delete)\b/
      .test(stripComments(readFileSync(f, 'utf8'), f)))
      .map((f) => relative(ROOT, f));
    expect(writes).toEqual([]);
  });

  it('the detector sees a direct write when there is one', () => {
    expect(/from\(\s*['"]reports['"]\s*\)\s*\.\s*(insert|update|upsert|delete)\b/.test("supabase.from('reports').insert({})")).toBe(true);
  });

  it('the house closes the table and counts one pending report per member', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,80}ON public\.reports \(reporter_id, content_type, content_id\)\s*WHERE status = 'pending'/);
    expect(MIGRATION).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.reports FROM anon, authenticated/);
    expect(MIGRATION).toMatch(/DROP POLICY IF EXISTS users_insert_own_reports/);
    expect(MIGRATION).toMatch(/EXCEPTION WHEN unique_violation THEN\s*RAISE EXCEPTION 'Already reported' USING ERRCODE = '23505'/);
  });

  it('the web offers only reasons the table accepts', () => {
    const check = /CONSTRAINT reports_reason_check CHECK \(\(reason = ANY \(ARRAY\[([^\]]*)\]/.exec(SNAPSHOT);
    expect(check).not.toBeNull();
    const allowed = new Set([...check![1].matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]));
    const button = readFileSync(join(ROOT, 'src', 'components', 'ReportButton.tsx'), 'utf8');
    const offered = [...button.matchAll(/value: '([a-z_]+)'/g)].map((m) => m[1]);
    expect(offered.length).toBe(5);
    expect(offered.filter((r) => !allowed.has(r))).toEqual([]);
  });
});
