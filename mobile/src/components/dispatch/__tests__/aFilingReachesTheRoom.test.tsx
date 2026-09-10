/**
 * aFilingReachesTheRoom.test.tsx — sharing a take to a lounge threw a database
 * error at the member.
 * ─────────────────────────────────────────────────────────────────────────────
 * The reader shares every kind of filing down the lounge's `dossier_share`
 * path, and it sent `title || body` as the card's title. A dossier has a title,
 * capped at 200. A TAKE has no title, so it sent the BODY — and a take runs to
 * 2,000 characters.
 *
 * `lounge_messages.film_title` has a CHECK of 300. Past it, the insert was
 * refused; the modal is "fire and forget" and had already closed; the member
 * got a toast reading `new row for relation "lounge_messages" violates check
 * constraint "lounge_messages_film_title_len"` and their filing never arrived.
 *
 * It failed for exactly the longer, more considered takes — the ones somebody
 * would want to show a room.
 *
 * These tests are on the CLAMP rather than the screen, because the clamp is
 * what every future caller of that column will pass through.
 */
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
/**
 * The REAL clamp, imported rather than re-typed. A copy of it here would pass
 * every one of these tests while the shipped one drifted — which is the same
 * fault as a plate drawing a screen the app does not have.
 */
import { cardTitle } from '@/src/components/ShareToLoungeModal';

/** The column's own ceiling, from the live schema. */
const COLUMN_CEILING = 300;

/** A take at the length a member can actually write. */
const LONG_TAKE =
  'Stalker is not slow, it is patient, and there is a difference that nobody making films '
  + 'today seems to understand any more. The camera waits because the men are waiting. '
  + 'When it finally moves you feel it in your chest rather than in your eyes, and that is '
  + 'the whole of Tarkovsky in one gesture, repeated for two and a half hours until you '
  + 'stop resisting it and start keeping time with it instead.';

describe('a filing shared to a room actually reaches it', () => {
  it('is the fixture that broke it — longer than the column allows', () => {
    // The instrument first. If this take ever gets shortened the tests below
    // pass for the wrong reason.
    expect(LONG_TAKE.length).toBeGreaterThan(COLUMN_CEILING);
  });

  it('never exceeds what the column will accept', () => {
    const out = cardTitle(LONG_TAKE)!;
    expect(out.length).toBeLessThanOrEqual(COLUMN_CEILING);
    // And it is inside the DESIGN's ceiling too, which is the tighter one: the
    // card sets this in two lines.
    expect(out.length).toBeLessThanOrEqual(MAX_LENGTHS.loungeShareTitle + 1);
  });

  it('cuts at a sentence, because the card is showing somebody’s writing', () => {
    const out = cardTitle(LONG_TAKE)!;
    // Not mid-word. `…and the thing about Ozu is that he ne` is not a title.
    expect(out).toMatch(/[.!?]…$/);
    expect(out.startsWith('Stalker is not slow')).toBe(true);
  });

  it('leaves a short filing exactly as it was written', () => {
    // A dossier's headline, a film's name, a stack's title: nothing to cut, and
    // nothing added. An ellipsis on an untouched title would be a lie about it.
    const title = 'The Long Silence in Ozu';
    expect(cardTitle(title)).toBe(title);
    expect(cardTitle('  Stalker  ')).toBe('Stalker');
  });

  it('says nothing rather than an empty string', () => {
    expect(cardTitle(undefined)).toBeNull();
    expect(cardTitle(null)).toBeNull();
    expect(cardTitle('   ')).toBeNull();
  });

  it('the ceiling is a real constant, not a number typed twice', () => {
    // The clamp reads MAX_LENGTHS, so raising the column later moves one value.
    expect(MAX_LENGTHS.loungeShareTitle).toBeGreaterThan(0);
    expect(MAX_LENGTHS.loungeShareTitle).toBeLessThan(COLUMN_CEILING);
  });
});
