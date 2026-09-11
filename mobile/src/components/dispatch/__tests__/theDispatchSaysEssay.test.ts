/**
 * theDispatchSaysEssay.test.ts — the wire word and the printed word.
 * ─────────────────────────────────────────────────────────────────────────────
 * The long form is an ESSAY. `dossier` is the WIRE word and it stays: it is the
 * kind value in the database, the table names, the mutation types, the metadata
 * key on every lounge message already sent. Changing any of those would orphan
 * rows and shares that already exist.
 *
 * What must never appear is the wire word printed at a member INSIDE the
 * Dispatch. That boundary is the whole point, and it is narrow on purpose:
 * elsewhere in the app "dossier" means something else entirely and is correct —
 * a member's own file (settings, the profile editor, initiation) and a film's
 * dossier on the film page. This does not touch those.
 *
 * The gap this closes: the naming sweep changed labels and missed a SENTENCE.
 * `compose.tsx` told a member "This dossier is 200 characters over the limit",
 * because a toast is prose and the sweep was looking at labels.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

/** Every source file that IS the Dispatch, tests excluded. */
const dispatchFiles = (): string[] =>
  execFileSync('git', ['ls-files', 'app/dispatch', 'src/components/dispatch'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\./.test(f));

/**
 * Quoted runs that read like PROSE — containing whitespace or ending a
 * sentence. An identifier such as `dossier_share`, a table name, or a kind
 * value has neither, which is exactly how the wire word is left alone.
 */
const proseStrings = (src: string): { line: number; text: string }[] => {
  const out: { line: number; text: string }[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    // drop line comments and jsdoc continuation lines
    const code = raw.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const m of code.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)) {
      const s = m[2];
      if (!s) continue;
      if (/\s/.test(s.trim()) || /[.!?]$/.test(s.trim())) out.push({ line: i + 1, text: s });
    }
  });
  return out;
};

describe('inside the Dispatch, the printed word is ESSAY', () => {
  it('no member-facing sentence says "dossier" — enumerated', () => {
    const offences: string[] = [];
    for (const f of dispatchFiles()) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const { line, text } of proseStrings(src)) {
        if (/dossier/i.test(text)) offences.push(`${f}:${line}  "${text.slice(0, 80)}"`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('the detector can still SEE the word — it is not passing on an empty sweep', () => {
    // A sweep that matches nothing passes in silence. This pins that the prose
    // filter would catch the sentence that was actually there.
    const found = proseStrings(
      'reelToast.error(`This dossier is 20 characters over the limit.`);',
    );
    expect(found.some((x) => /dossier/i.test(x.text))).toBe(true);
  });

  it('leaves the WIRE word alone — an identifier is not prose', () => {
    // These must NOT be reported: they are the database's vocabulary.
    const wire = proseStrings(
      `const t = 'dossier_share'; const k = 'dossier'; from('dossier_comments')`,
    );
    expect(wire.filter((x) => /dossier/i.test(x.text))).toEqual([]);
  });

  it('reads a real, non-empty set of Dispatch files', () => {
    // If the git listing ever came back empty the first test would pass
    // vacuously, which is the failure mode this whole file exists to avoid.
    expect(dispatchFiles().length).toBeGreaterThan(10);
  });
});
