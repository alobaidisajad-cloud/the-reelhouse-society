/**
 * turns — whose answer is still the newest word on a thing.
 *
 * A read asked again while the last was still out (an open, a refresh, a pull) is answered in any
 * order, and an older answer that lands last is drawn over the newer state. So each read of a thing
 * takes the thing's next turn as it is asked (`take`), and its answer is laid only while that turn is
 * still the thing's last (`isLast`). A write of the thing takes a turn as it begins and another as it
 * settles: a read asked before it, or while it was out, is older than it. A read that lays only a part
 * of a thing reads the turn without taking one (`now`): a newer whole read or a write makes it older,
 * and it never makes a whole read older for its part.
 *
 * anAnswerIsStillTheOneAsked.guard.test.ts reads `x.isLast(key, mine)` as the check that an answer is
 * still the read asked, where `mine` came from `x.take(` or `x.now(` of the same turns.
 */
export interface Turns {
  /** The thing's next turn: every turn taken before it is now older. */
  take(key: string): number;
  /** The thing's turn now, taken by nobody: older once anyone takes one. */
  now(key: string): number;
  /** Whether this turn is still the thing's last. */
  isLast(key: string, turn: number): boolean;
}

/** One family of things, each with its own turns: the filings, the critiques of each filing, a member's profile. */
export function turns(): Turns {
  let taken = 0;
  const last = new Map<string, number>();
  return {
    take: (key) => {
      taken += 1;
      last.set(key, taken);
      return taken;
    },
    now: (key) => last.get(key) ?? 0,
    isLast: (key, turn) => (last.get(key) ?? 0) === turn,
  };
}
