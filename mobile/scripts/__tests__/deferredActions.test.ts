/**
 * scripts/deferred-actions.cjs: every entry of supabase/DEFERRED-ACTIONS.md says when it falls due,
 * and the check fails once it has: at the launch build's record for the launch-time steps, on its
 * day for a date. Planted entries prove each refusal and each trigger.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MOBILE } from '../../test-utils/readCode';

const { check, facts, parse } = require('../../scripts/deferred-actions.cjs') as {
  check: (text: string, f: { launched: boolean; today: string }) => { refused: string[]; due: string[] };
  facts: (mobile?: string, now?: Date) => { launched: boolean; today: string };
  parse: (text: string) => { title: string; trigger: string | null }[];
};

const FILE = readFileSync(join(MOBILE, 'supabase', 'DEFERRED-ACTIONS.md'), 'utf8');
const BEFORE = { launched: false, today: '2026-11-20' };
const entry = (title: string, trigger: string) => `## ${title}\n\n**Trigger** ${trigger}\nWords.\n`;

it('holds every entry of the real file to a known trigger, none of them due today', () => {
  const entries = parse(FILE);
  expect(entries.length).toBeGreaterThanOrEqual(26);
  expect(entries.every((e) => e.trigger)).toBe(true);
  expect(check(FILE, facts())).toEqual({ refused: [], due: [] });
});

it('reads the file the same with Windows line ends', () => {
  const lf = FILE.split('\r\n').join('\n');
  const triggers = parse(lf).map((e) => e.trigger);
  expect(triggers.every(Boolean)).toBe(true);
  expect(parse(lf.split('\n').join('\r\n')).map((e) => e.trigger)).toEqual(triggers);
});

it('refuses an entry with no trigger, an unknown one, a standing one with no reason and a date that is not a day', () => {
  const text = [
    '## A. none\n\nWords.\n',
    entry('B. unknown', '`someday`'),
    entry('C. bare standing', '`standing`'),
    entry('D. bad day', '`date 2026-13-45`'),
    entry('E. no day', '`date`'),
    entry('F. a launch step with a date', '`launch-build 2027-01-01`'),
    entry('G. fine', '`standing` — nothing triggers it; a named guard watches it'),
  ].join('\n');
  const { refused, due } = check(text, BEFORE);
  expect(refused.map((r) => r.split(':')[0])).toEqual(['A. none', 'B. unknown', 'C. bare standing', 'D. bad day', 'E. no day', 'F. a launch step with a date']);
  expect(due).toEqual([]);
});

it('makes every launch step due once the launch build is recorded, and a date due on its day', () => {
  const text = [
    entry('A. after', '`launch-build`'),
    entry('B. before', '`before-launch-build`'),
    entry('C. dated', '`date 2026-12-18`'),
    entry('D. standing', '`standing` — nothing triggers it; a named guard watches it'),
  ].join('\n');
  expect(check(text, BEFORE).due).toEqual([]);
  expect(check(text, { launched: false, today: '2026-12-17' }).due).toEqual([]);
  expect(check(text, { launched: false, today: '2026-12-18' }).due).toEqual(['C. dated: due since 2026-12-18']);
  expect(check(text, { launched: true, today: '2026-11-20' }).due).toEqual([
    'A. after: the launch build has shipped',
    'B. before: overdue: the launch build has shipped',
  ]);
});

it('takes the launch from a shipped client marked as the launch build, and no other', () => {
  const world = (clients: object[]) => {
    const dir = mkdtempSync(join(tmpdir(), 'deferred-'));
    mkdirSync(join(dir, 'e2e'));
    writeFileSync(join(dir, 'e2e', 'old-clients.json'), JSON.stringify({ clients }));
    return dir;
  };
  expect(facts(world([{ buildNumber: '41' }, { buildNumber: '42', launch: 'yes' }])).launched).toBe(false);
  expect(facts(world([{ buildNumber: '41' }, { buildNumber: '42', launch: true }])).launched).toBe(true);
  expect(facts(MOBILE, new Date('2026-12-18T23:00:00Z')).today).toBe('2026-12-18');
});
