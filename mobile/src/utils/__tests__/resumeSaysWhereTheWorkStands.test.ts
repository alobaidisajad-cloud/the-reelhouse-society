/**
 * resumeSaysWhereTheWorkStands.test.ts — mobile/scripts/resume.cjs, which every
 * working session starts by running (WORKLIST P0.59): the next class is the
 * one that matters most, a journal keeps what was written in it, every worktree
 * finds the same journals, and the next train is the migrations still pending.
 */
import { readFileSync } from 'fs';
import { join, sep } from 'path';

const resume = require('../../../scripts/resume.cjs') as {
  HEADER_END: string;
  HEADER_START: string;
  headerFor: (area: string, inArea: object[], today: string) => string;
  nextOpen: (all: object[]) => { id: string }[];
  pending: () => string[];
  privateDir: (commonDir: string) => string;
  withHeader: (journal: string, header: string) => string;
};
const { files } = require('../../../test-utils/universe') as { files: (u: string) => string[] };

const MOBILE = join(__dirname, '..', '..', '..');

describe('the next class', () => {
  const at = (id: string, more: object) => ({ id, area: 'x', status: 'OPEN', seriousness: 'code', count: 0, ...more });

  it('is one open in production first, then the most serious, then the one with the most cases', () => {
    const order = resume.nextOpen([
      at('CODE-many', { count: 900 }),
      at('LAYOUT-some', { seriousness: 'layout', count: 3 }),
      at('SERIOUS-few', { seriousness: 'serious', count: 1 }),
      at('SERIOUS-more', { seriousness: 'serious', count: 5 }),
      at('LIVE-hole', { seriousness: 'behaviour', count: 1, open_in_production: true }),
    ]).map((c) => c.id);
    expect(order).toEqual(['LIVE-hole', 'SERIOUS-more', 'SERIOUS-few', 'LAYOUT-some', 'CODE-many']);
  });

  it('is never one already closed or out of scope', () => {
    const order = resume.nextOpen([at('A-done', { status: 'CLOSED' }), at('B-out', { status: 'OUT_OF_SCOPE' }), at('C-guarded', { status: 'GUARDED' })]);
    expect(order.map((c) => c.id)).toEqual(['C-guarded']);
  });
});

describe('a journal', () => {
  const header = (n: number) => resume.headerFor('database', [{ id: 'DB-x', status: 'OPEN', count: n }], '2026-10-16');

  it('gets a header when new, and keeps everything written below it when the header is written again', () => {
    const fresh = resume.withHeader('', header(1));
    expect(fresh.startsWith(resume.HEADER_START)).toBe(true);
    const written = `${fresh}\nWhat I found today, in my own words.\n`;
    const again = resume.withHeader(written, header(2));
    expect(again).toContain('- DB-x: OPEN, 2');
    expect(again).not.toContain('- DB-x: OPEN, 1');
    expect(again.endsWith('What I found today, in my own words.\n')).toBe(true);
    expect(again.split(resume.HEADER_END)).toHaveLength(2);
  });

  it('keeps a journal written before it had a header, whole, below the new one', () => {
    expect(resume.withHeader('Notes from before.\n', header(1))).toBe(`${header(1)}\n\nNotes from before.\n`);
  });

  it('is found through git\'s common directory, so every worktree writes the same one', () => {
    expect(resume.privateDir(join('C:', 'repo', '.git')).split(sep).slice(-5)).toEqual(['repo', 'mobile', 'audit', 'final', 'private']);
    expect(readFileSync(join(MOBILE, 'scripts', 'resume.cjs'), 'utf8')).toContain("'--git-common-dir'");
  });
});

describe('the next train', () => {
  it('is every migration of the shared list that APPLIED.txt does not name, and only those', () => {
    const applied = readFileSync(join(MOBILE, 'supabase', 'APPLIED.txt'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    const migrations = files('migrations').map((p) => p.split(/[\\/]/).pop());
    const waiting = resume.pending();
    for (const name of waiting) {
      expect([name, migrations.includes(name)]).toEqual([name, true]);
      expect([name, applied.includes(name)]).toEqual([name, false]);
    }
    expect(migrations.filter((n) => n && !applied.includes(n)).sort()).toEqual(waiting);
  });
});
