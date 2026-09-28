/**
 * theRecordingsTravel.test.ts — what the tests and the sealed world read is in git.
 *
 * The E2E world answers TMDB from recordings. Every SEARCH recording was kept
 * out of git by an unanchored `search_*.json` in .gitignore (meant for debug
 * dumps at the root): the recordings worked on the machine that made them, the
 * runner never had them, and every search in the sealed world found nothing —
 * two flows failed for a reason no log could show.
 *
 * On a fresh checkout (CI) an ignored file is simply absent, so the index is
 * checked against the disk; and on any machine, git is asked directly whether
 * it would keep each fixture.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { execFileSync } from 'child_process';
import { MOBILE } from '@/test-utils/readCode';

const TMDB = join(MOBILE, 'e2e', 'supabase', 'functions', 'tmdb-proxy', 'fixtures');
const DIRS = [TMDB, join(MOBILE, 'mockups', 'fixtures')];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p); else out.push(p);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

describe('the recordings and fixtures travel with the code', () => {
  it('every recording the TMDB stand-in indexes is on disk', () => {
    const index = JSON.parse(readFileSync(join(TMDB, 'index.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(index).length).toBeGreaterThan(3);
    const missing = Object.entries(index).filter(([, file]) => !existsSync(join(TMDB, file))).map(([path]) => path);
    expect(missing).toEqual([]);
  });

  it('git keeps every fixture — none is ignored', () => {
    const files = DIRS.flatMap(filesUnder).map((f) => relative(MOBILE, f).split(sep).join('/'));
    expect(files.length).toBeGreaterThan(5);
    // `git check-ignore` prints the paths it WOULD ignore (exit 1 when none).
    let ignored = '';
    try {
      ignored = execFileSync('git', ['check-ignore', '--no-index', ...files], { cwd: MOBILE, encoding: 'utf8' });
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      if (err.status !== 1) throw e;           // 1 = nothing ignored; anything else is a real error
      ignored = err.stdout ?? '';
    }
    expect(ignored.split(/\r?\n/).filter(Boolean)).toEqual([]);
  });
});
