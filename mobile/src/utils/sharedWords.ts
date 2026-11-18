/**
 * sharedWords — what a member's words may say once they leave the house.
 *
 * A review or a filing marked as a spoiler is veiled on its page until the reader uncovers it. A
 * share sends the words where no veil can follow (a picture, a line of text in another app, a card
 * in a salon read by members who never asked), and every share printed them in clear: the log's
 * file, the film page's text share, a take's line and its preview, a take's card in a salon. One
 * rule now: words marked as a spoiler never leave; the share says only that there are spoilers.
 */

/** Said where spoiler-marked words would have stood: the reader is sent to the house for them. */
export const SPOILERS_LEADER = 'SPOILERS — READ IT IN THE HOUSE';

/**
 * The words as they may leave the house: none when they are marked as a spoiler (`spoiler` is the
 * mark: a log's is_spoiler, a filing's spoiler label), and none when there are none.
 */
export function sharedWords(words: string | null | undefined, spoiler: boolean | string | null | undefined): string | null {
  if (spoiler) return null;
  const said = (words ?? '').trim();
  return said || null;
}
