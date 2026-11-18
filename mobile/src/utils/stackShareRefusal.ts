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
