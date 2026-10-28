/**
 * EVERY WAY INTO A SALON IS ROPED (P4.16).
 *
 * Sharing a film, a log, a stack, a filing or an artist into a salon is posting a message there,
 * which is the Archivist's. Three share buttons opened the salon list for every rank, and the
 * share sheet's route opened it for anyone who reached it: the house refused the message only
 * after the member had chosen a salon. Every file that draws the salon list (ShareToLoungeModal)
 * or opens the share sheet in a share mode is listed under `lounge-speaking`, which the registry
 * test holds to a `useClearance('lounge-speaking')` in each; so is the sheet itself.
 * Read from each file's code, comments removed.
 */
import { readCode } from '@/test-utils/readCode';
import { files, rel } from '@/test-utils/universe';
import { GATED_FEATURES } from '@/src/constants/gatedFeatures';

const SALON_LIST = /<ShareToLoungeModal\b/;
/** A push of the share sheet: its path, then its arguments up to the call's end. */
const SHEET_PUSH = /\.(?:push|navigate|replace)\(\s*(?:\{\s*pathname:\s*)?['"`]\/(?:\(modals\)\/)?social-modal['"`][^)]*\)/g;
/** The share modes' arguments; followers and following take a userId. */
const SHARE_MODE = /\b(?:personId|shareFilmId)\b/;

const ways: string[] = [];
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  if (f === 'src/components/ShareToLoungeModal.tsx') continue;
  const text = readCode(f);
  const pushes = [...text.matchAll(SHEET_PUSH)].map((m) => m[0]);
  if (SALON_LIST.test(text) || pushes.some((p) => SHARE_MODE.test(p))) ways.push(f);
}
const speaking = GATED_FEATURES.find((g) => g.id === 'lounge-speaking')?.gates ?? [];

describe('every way into a salon is roped', () => {
  it('finds the ways it knows: the feed card, the log, the stack, the filing and the artist', () => {
    expect(ways).toEqual(expect.arrayContaining([
      'src/components/feed/ActionDeck.tsx',
      'app/log/[id].tsx',
      'app/stacks/[id].tsx',
      'app/dispatch/[id].tsx',
      'app/person/[id].tsx',
    ]));
  });

  it('each is a listed lounge-speaking rope', () => {
    expect(ways.filter((f) => !speaking.includes(f))).toEqual([]);
  });

  it('the share sheet, which its route opens directly, is a rope of its own', () => {
    expect(speaking).toContain('app/(modals)/social-modal.tsx');
  });
});
