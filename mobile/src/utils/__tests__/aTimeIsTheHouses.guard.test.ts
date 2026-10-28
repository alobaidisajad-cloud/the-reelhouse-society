/**
 * A TIME THE HOUSE COMPARES IS THE HOUSE'S (P4.32).
 *
 * The phone's clock is the member's to set, and can be a day wrong. Three times the app writes
 * were taken from it and compared by the house with its own: a salon's last read (a phone a day
 * ahead read every later message as read), and when a filing or a critique was changed. Since
 * 20261028_02 the house dates each itself whenever a member's write changes it; the time the
 * phone sends only says that it changed. This file finds every write that sets a column ending
 * in `_at` from the phone's clock (`new Date()`, `Date.now()`, or a `now` made from them), read
 * from each file's code, and fails on one the house does not date itself, or a listed one gone.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';

/** The phone's clock, as the app's code spells a reading of it. */
const PHONE_TIME = /\b(\w+_at)\s*[:=]\s*(?:new Date\(|Date\.now\(|now\b)/g;

/** Each write the house dates itself, by file, and the trigger that does. */
const DATED_BY_THE_HOUSE: Record<string, { columns: string[]; by: string }> = {
  'src/stores/dispatch.ts': { columns: ['edited_at', 'updated_at'], by: 'dispatch_posts_pin_columns and dispatch_comments_pin_columns' },
  'src/stores/lounge.ts': { columns: ['last_read_at'], by: 'lounge_members_read_by_the_house' },
  'src/utils/mutationExecutor.ts': { columns: ['edited_at', 'updated_at'], by: 'dispatch_posts_pin_columns and dispatch_comments_pin_columns' },
};

/** The argument of each write a file makes: `.update(…)`, `.insert(…)`, `.upsert(…)`, and a payload set by assignment. */
function writesIn(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/\.(?:update|insert|upsert)\(/g)) {
    let depth = 0;
    let j = (m.index ?? 0) + m[0].length - 1;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')') { depth--; if (!depth) break; }
    }
    out.push(code.slice(m.index, j + 1));
  }
  // A payload built field by field before it is sent (`safe.updated_at = new Date()…`).
  for (const m of code.matchAll(/\b\w+\.(\w+_at)\s*=\s*(?:new Date\(|Date\.now\()[^;\n]*/g)) out.push(m[0].replace(/^\w+\./, ''));
  return out;
}

const found: Record<string, string[]> = {};
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  const code = readCode(f);
  const columns = new Set<string>();
  for (const w of writesIn(code)) for (const m of w.matchAll(PHONE_TIME)) columns.add(m[1] ?? '');
  if (columns.size) found[f] = [...columns].sort();
}

describe('a time the house compares', () => {
  it('finds the writes that read the phone\'s clock: a salon\'s read among them', () => {
    expect(found['src/stores/lounge.ts']).toContain('last_read_at');
  });

  it('is set by the house wherever the phone sends one', () => {
    const undated = Object.entries(found)
      .flatMap(([f, columns]) => columns.filter((c) => !DATED_BY_THE_HOUSE[f]?.columns.includes(c)).map((c) => `${f}: ${c}`));
    expect(undated).toEqual([]);
  });

  it('lists no write that is gone, and each trigger it names is in the migration that makes it', () => {
    const migration = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261028_02_a_row_is_dated_by_the_house.sql'), 'utf8');
    for (const [f, { columns, by }] of Object.entries(DATED_BY_THE_HOUSE)) {
      expect(`${f}: ${(found[f] ?? []).join(',')}`).toBe(`${f}: ${[...columns].sort().join(',')}`);
      for (const fn of by.split(' and ')) expect(`${fn}: ${migration.includes(`FUNCTION public.${fn}()`)}`).toBe(`${fn}: true`);
    }
  });
});
