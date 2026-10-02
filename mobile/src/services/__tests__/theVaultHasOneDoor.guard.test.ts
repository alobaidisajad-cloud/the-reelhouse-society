/**
 * theVaultHasOneDoor.guard.test.ts — only VaultService queries a private note.
 *
 * VaultService says it is the only place in the app that writes
 * `log_private_notes`, and the archive import wrote the table itself. A note
 * written past this file is written past its rules (one viewing, the rank gate
 * read back as the house's sentence). The export reads the table whole through
 * its own paged reader, never a query on it; the registry only names it.
 */
import { readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';

const DOOR = 'src/services/VaultService.ts';
const QUERY = /\.from\(\s*['"`]log_private_notes['"`]/;

function querying(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') walk(p); continue; }
      if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
      const rel = relative(MOBILE, p).split(sep).join('/');
      if (QUERY.test(readCode(p))) found.push(rel);
    }
  };
  walk(join(MOBILE, 'app'));
  walk(join(MOBILE, 'src'));
  return found.sort();
}

it('the scan sees the door itself — not passing on an empty list', () => {
  expect(querying()).toContain(DOOR);
});

it('no other file queries the table', () => {
  expect(querying().filter((f) => f !== DOOR)).toEqual([]);
});
