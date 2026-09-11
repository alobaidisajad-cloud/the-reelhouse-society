/**
 * yourOwnRankOnYourOwnByline.test.ts — the mark a member wears on their own work.
 * ─────────────────────────────────────────────────────────────────────────────
 * Every composing screen builds its own author object by hand, and each one
 * decided the member's rank separately. Two got it wrong:
 *
 *   ComposeDesks (ballot)   forced `tier: 'auteur'` — so a FOUNDING member
 *                           opening a ballot wore somebody else's mark.
 *   [id].tsx (critique)     hardcoded `tier: 'free'` — so EVERY member writing
 *                           a critique was shown as unranked, Archivist and
 *                           Auteur and Founding alike.
 *
 * ComposeDesks already carries a comment saying this exact defect was found and
 * fixed for the filing desks. It survived twice more, one line and one file
 * away, because a hand-built object is a decision repeated rather than shared.
 *
 * `paperTierOf` is the one place that decides. This requires every screen on
 * the Dispatch that hands a `tier` to a composer to go through it — so the
 * fourth hand-built byline cannot quietly disagree with the other three.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const dispatchFiles = (): string[] =>
  execFileSync('git', ['ls-files', 'app/dispatch', 'src/components/dispatch'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/__tests__|\.test\./.test(f));

describe('a member wears their own rank', () => {
  it('no Dispatch screen writes a LITERAL tier for the signed-in member', () => {
    const offences: string[] = [];

    for (const f of dispatchFiles()) {
      const src = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      src.split(/\r?\n/).forEach((line, i) => {
        const m = /(^|[^\w])tier:\s*'(\w+)'/.exec(line);
        if (!m) return;

        // A DELETED author legitimately has no rank — `author ?? { name:
        // '[deleted]', memberNo: 0, tier: 'free' }` is the fallback for a
        // person who is gone, not a claim about a member who is here.
        if (/\[deleted\]/.test(line)) return;

        offences.push(`${f}:${i + 1}  tier: '${m[2]}'`);
      });
    }

    expect(offences).toEqual([]);
  });

  it('the two composers that were wrong now ask paperTierOf', () => {
    const critique = fs.readFileSync(path.join(ROOT, 'app/dispatch/[id].tsx'), 'utf8');
    expect(critique).toMatch(/tier:\s*paperTierOf\(me\)/);

    // The ballot desk hands the whole `me` through rather than re-deciding it.
    const desks = fs.readFileSync(path.join(ROOT, 'src/components/dispatch/ComposeDesks.tsx'), 'utf8');
    expect(desks).not.toMatch(/\.\.\.me,\s*tier:/);
  });

  it('the detector can SEE a literal tier — it is not passing on an empty sweep', () => {
    // A sweep that matches nothing passes in silence.
    const sample = "  me={{ name: 'x', memberNo: 1, tier: 'auteur' }}";
    expect(/(^|[^\w])tier:\s*'(\w+)'/.test(sample)).toBe(true);
    // …and still lets the deleted-author fallback through.
    const deleted = "author={author ?? { name: '[deleted]', memberNo: 0, tier: 'free' }}";
    expect(/\[deleted\]/.test(deleted)).toBe(true);
  });

  it('reads a real, non-empty set of Dispatch files', () => {
    expect(dispatchFiles().length).toBeGreaterThan(10);
  });
});
