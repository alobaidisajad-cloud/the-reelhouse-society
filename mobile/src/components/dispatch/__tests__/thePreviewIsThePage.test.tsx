/**
 * thePreviewIsThePage.test.tsx — one essay typography, not two.
 * ─────────────────────────────────────────────────────────────────────────────
 * The writing room's preview set an essay in Courier 15/24 in `bone`, with its
 * own heading sizes and no raised initial. The page it would appear on sets it
 * in Spectral 16.5/28 in `parchment`, opens it with a raised initial, and prints
 * a section break as an ornament.
 *
 * So the one screen whose entire job is to answer "how will this read?" answered
 * with a different document. A member could learn nothing there.
 *
 * The fix was not to copy the reader's numbers across — two copies agree until
 * one is touched. The preview MOUNTS the reader. This holds that, and holds the
 * two things that came with it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const COMPOSE = readFileSync(join(ROOT, 'app', 'dispatch', 'compose.tsx'), 'utf8');

const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

const CODE = strip(COMPOSE);

describe('the preview is the page', () => {
  it('mounts the reader’s own body rather than a second typography', () => {
    expect(CODE).toMatch(/<EssayBody\s/);
    expect(CODE).toMatch(/from '@\/src\/components\/dispatch\/EssayBody'/);
  });

  it('and keeps no private markdown stylesheet to drift from it', () => {
    // The stylesheet that made the preview a different document. Its absence is
    // the whole point; a file that still declares one has re-forked the answer.
    expect(CODE).not.toMatch(/markdownStyles/);
    expect(CODE).not.toMatch(/from 'react-native-markdown-display'/);
  });

  it('and no longer holds its own copy of the link guard', () => {
    // `EssayBody` carries `onMarkdownLinkPress` itself. A second call site is a
    // second thing to forget when the guard changes.
    expect(CODE).not.toMatch(/onMarkdownLinkPress/);
  });

  it('the render cap and the write cap are still the same number', () => {
    // This is what makes capping the preview safe. `capMarkdownForRender` cuts
    // at `dossierContent`; the composer refuses to file past `filingEssay`. If
    // they ever diverge, a publishable essay could be truncated in its own
    // author's preview — which is what the old uncapped note was guarding
    // against, and the reason that note could be retired rather than ignored.
    const caps = readFileSync(join(ROOT, 'src', 'utils', 'sanitizeInput.ts'), 'utf8');
    const essay = /filingEssay:\s*(\d+)/.exec(caps);
    const dossier = /dossierContent:\s*(\d+)/.exec(caps);
    expect(essay).not.toBeNull();
    expect(dossier).not.toBeNull();
    expect(Number(essay![1])).toBe(Number(dossier![1]));
  });

  it('the detector reads the file it thinks it does', () => {
    // Vacuous-guard insurance: every assertion above is an ABSENCE, and a bad
    // path would satisfy all of them at once.
    expect(COMPOSE.length).toBeGreaterThan(5000);
    expect(CODE).toMatch(/ComposeDossierScreen/);
    expect(CODE).toMatch(/insertFormatting/);
  });

  it('and strips comments before asserting an absence', () => {
    // The words above appear in prose in that file explaining why they are
    // gone. Matching raw source would pass or fail on the explanation rather
    // than on the code.
    expect(strip('// markdownStyles was here\nconst a = 1;')).not.toMatch(/markdownStyles/);
    expect(strip('{/* onMarkdownLinkPress */}\nconst b = 2;')).not.toMatch(/onMarkdownLinkPress/);
    expect(strip('const c = 3; // fine')).toMatch(/const c = 3;/);
  });
});
