/**
 * stackShareRefusal — the house's two final answers to a stack's card in a salon (review round 13):
 * the stack is SEALED (read by its curator alone, so shown in no salon: 42501 'STACK_SEALED'), or it
 * is no longer in the house (P0002 'STACK_GONE'). Neither changes by trying again, so neither is
 * offered again: the card leaves the transcript, and the member is told which it was. Read by the
 * live send (lounge.ts sendMessage) and the queue's replay of one made offline (mutationExecutor).
 */
import { isGoneFromTheHouse } from '@/src/utils/goneFromTheHouse';

export type StackShareRefusal = 'sealed' | 'gone';

export const STACK_SEALED_SAID = 'That stack is sealed: a sealed stack is shown in no salon.';
export const STACK_GONE_SAID = 'That stack is no longer in the house.';

/** Which of the two the house answered, or null for any other answer. */
export function stackShareRefusal(e: unknown): StackShareRefusal | null {
  const x = e as { code?: unknown; message?: unknown } | null;
  if (x?.code === '42501' && x.message === 'STACK_SEALED') return 'sealed';
  if (isGoneFromTheHouse(e, 'STACK_GONE')) return 'gone';
  return null;
}

/** What the member is told for it. */
export const saidOfStackShareRefusal = (r: StackShareRefusal): string => (r === 'sealed' ? STACK_SEALED_SAID : STACK_GONE_SAID);

/**
 * Every card the house refuses for good (review round 14). Since round 14 the house writes a card
 * from the piece it names, read as the sharer: a record or a filing no longer in the house (or no
 * longer the sharer's to read: made private, withdrawn, its author's block) is refused as a stack's
 * is, 'LOG_GONE' and 'PIECE_GONE' (P0002). None changes by trying again: each is said, and the
 * card, which names the piece, is let go.
 */
export type CardShareRefusal = StackShareRefusal | 'record gone' | 'filing gone';

export const RECORD_GONE_SAID = 'That record is no longer in the house.';
export const FILING_GONE_SAID = 'That filing is no longer in the house.';

/** Which the house answered, or null for any other answer. */
export function cardShareRefusal(e: unknown): CardShareRefusal | null {
  const stack = stackShareRefusal(e);
  if (stack) return stack;
  if (isGoneFromTheHouse(e, 'LOG_GONE')) return 'record gone';
  if (isGoneFromTheHouse(e, 'PIECE_GONE')) return 'filing gone';
  return null;
}

/** What the member is told for it. */
export const saidOfCardShareRefusal = (r: CardShareRefusal): string =>
  (r === 'record gone' ? RECORD_GONE_SAID : r === 'filing gone' ? FILING_GONE_SAID : saidOfStackShareRefusal(r));

/** The house's word for it, as the queue lets the write go. */
export const wordOfCardShareRefusal = (r: CardShareRefusal): string =>
  (r === 'record gone' ? 'LOG_GONE' : r === 'filing gone' ? 'PIECE_GONE' : r === 'sealed' ? 'STACK_SEALED' : 'STACK_GONE');
