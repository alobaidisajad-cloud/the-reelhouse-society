/**
 * noIntlInTheDispatch.test.ts — the formatting that works everywhere but here.
 * ─────────────────────────────────────────────────────────────────────────────
 * Hermes ships without Intl and this app carries no polyfill. Node has a full
 * one. So anything routed through Intl is correct in every test on this machine
 * and wrong on every phone — silently, with no error to catch and nothing in a
 * screenshot to notice.
 *
 * `dayLabel.ts` was written to avoid exactly this for DATES. Nobody had looked
 * at the NUMBERS, and three `toLocaleString()` calls had gone in: the word count
 * under a dossier, and the over-limit warning in the writing room twice. On
 * device they printed `24310` where the design says `24,310`.
 *
 * Two things are held here — the rule, and the replacement — because the rule
 * alone would pass against a `groupDigits` that returned the wrong string.
 */
import fs from 'fs';
import path from 'path';

import { groupDigits, formatCount } from '@/src/components/dispatch/paper/paperMetrics';

const ROOTS = [
  path.join(__dirname, '..'),
  path.join(__dirname, '..', '..', '..', '..', 'app', 'dispatch'),
];

/** Every source file of the Dispatch, tests excluded. */
function sources(): Array<{ label: string; text: string }> {
  const out: Array<{ label: string; text: string }> = [];
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full, prefix + entry.name + '/');
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push({ label: prefix + entry.name, text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(ROOTS[0], 'src/components/dispatch/');
  walk(ROOTS[1], 'app/dispatch/');
  return out;
}

describe('the Dispatch never asks Hermes for something it does not have', () => {
  const files = sources();

  it('read the files at all', () => {
    // A walker that finds nothing makes every assertion below vacuous, and this
    // suite would then be a green light over an unchecked feature.
    expect(files.length).toBeGreaterThan(15);
    expect(files.some((f) => f.label.endsWith('paperMetrics.ts'))).toBe(true);
    expect(files.some((f) => f.label.startsWith('app/dispatch/'))).toBe(true);
  });

  it('uses no Intl API anywhere', () => {
    // Comments are stripped first: three files DISCUSS `toLocaleDateString` at
    // length, and matching those would make the guard permanently red for
    // explaining itself — which is how a guard gets deleted.
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const offenders: string[] = [];
    for (const f of files) {
      const code = strip(f.text);
      for (const api of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'Intl.']) {
        if (code.includes(api)) offenders.push(f.label + ' → ' + api);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('groupDigits', () => {
  it('groups in threes', () => {
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(999)).toBe('999');
    expect(groupDigits(1000)).toBe('1,000');
    expect(groupDigits(24310)).toBe('24,310');
    expect(groupDigits(999999)).toBe('999,999');
    expect(groupDigits(1234567)).toBe('1,234,567');
  });

  it('keeps a minus sign outside the digits', () => {
    expect(groupDigits(-1234)).toBe('-1,234');
  });

  it('truncates rather than printing a grouped decimal', () => {
    // The one-line regex version of this groups the digits AFTER the point too,
    // turning 1234.5678 into 1,234.567,8.
    expect(groupDigits(1234.5678)).toBe('1,234');
  });

  it('is not formatCount — one groups, the other abbreviates', () => {
    // Both exist on purpose. A character count must be exact ("1,204 over"); a
    // certify count on a card must not be six digits wide.
    expect(groupDigits(24310)).toBe('24,310');
    expect(formatCount(24310)).toBe('24K');
  });
});
