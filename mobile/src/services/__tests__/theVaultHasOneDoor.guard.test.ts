/**
 * theVaultHasOneDoor.guard.test.ts — only VaultService queries a private note.
 *
 * VaultService says it is the only place in the app that writes
 * `log_private_notes`, and the archive import wrote the table itself. A note
 * written past this file is written past its rules (one viewing, the rank gate
 * read back as the house's sentence). The export reads the table whole through
 * its own paged reader, never a query on it; the registry only names it.
 */
import { relative, sep } from 'path';
import { MOBILE, readCode } from '@/test-utils/readCode';
import { files as universe } from '@/test-utils/universe';

const DOOR = 'src/services/VaultService.ts';
const QUERY = /\.from\(\s*['"`]log_private_notes['"`]/;

function querying(): string[] {
  const found: string[] = [];
  for (const p of universe('appCode')) {
    if (QUERY.test(readCode(p))) found.push(relative(MOBILE, p).split(sep).join('/'));
  }
  return found.sort();
}

it('the scan sees the door itself — not passing on an empty list', () => {
  expect(querying()).toContain(DOOR);
});

it('no other file queries the table', () => {
  // The sweep finds the one door it allows, so it can see a query at all.
  expect(querying()).toContain(DOOR);
  expect(querying().filter((f) => f !== DOOR)).toEqual([]);
});
