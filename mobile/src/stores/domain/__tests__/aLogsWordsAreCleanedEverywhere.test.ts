/**
 * aLogsWordsAreCleanedEverywhere.test.ts — a log's words, cleaned by their own limits.
 *
 * Only the review was cleaned. The pull quote and "watched with" went to the
 * database exactly as typed — a right-to-left override, a zero-width joiner, a
 * control character — on the live save, the offline replay and the import, and
 * the Vault note was capped at the review's 5,000 against its own column's 1,000.
 * cleanLogWords is the live save's one place (add and update); the offline
 * replay's keys are held in mutationExecutor.test.
 */
import { cleanLogWords } from '../logSlice/helpers/logOperations';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

const RLO = '‮';      // right-to-left override: turns what follows backwards on screen
const ZWSP = '​';     // zero-width space
const BELL = '\u0007';

describe('the live save cleans every word a log carries', () => {
  it('the pull quote and the companion lose what no one meant to type', () => {
    const log = { review: `A held${BELL} breath.`, pullQuote: `${RLO}Forget it, Jake.${ZWSP}`, watchedWith: `  @ana${BELL}  ` };
    cleanLogWords(log);
    expect(log).toEqual({ review: 'A held breath.', pullQuote: 'Forget it, Jake.', watchedWith: '@ana' });
  });

  it('each is held to its own limit', () => {
    const log = { review: 'r'.repeat(6000), pullQuote: 'p'.repeat(500), watchedWith: 'w'.repeat(200) };
    cleanLogWords(log);
    expect([log.review.length, log.pullQuote.length, log.watchedWith!.length])
      .toEqual([MAX_LENGTHS.review, MAX_LENGTHS.pullQuote, MAX_LENGTHS.watchedWith]);
  });

  it('a companion of nothing but blanks is no companion', () => {
    const log = { watchedWith: `${ZWSP}   ` };
    cleanLogWords(log);
    expect(log.watchedWith).toBeNull();
  });

  it('a field the save does not carry is left out, not blanked', () => {
    const log: { review?: string; pullQuote?: string } = { review: 'Kept.' };
    cleanLogWords(log);
    expect(log).toEqual({ review: 'Kept.' });
  });
});
