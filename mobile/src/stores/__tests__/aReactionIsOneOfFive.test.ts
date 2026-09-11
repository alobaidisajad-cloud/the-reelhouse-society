/**
 * aReactionIsOneOfFive.test.ts — the reaction row, and what may lead it.
 * ─────────────────────────────────────────────────────────────────────────────
 * `lounge_message_reactions.reaction` was plain text with only a 100-character
 * cap. Nothing restricted the VALUE, so a client speaking to PostgREST directly
 * could write any string as a reaction — and because both sort functions ranked
 * with `LOUNGE_REACTIONS.indexOf()`, which answers -1 for an unknown, that
 * string sorted BEFORE every real reaction. It would have led the reaction row
 * on that message for every member who opened the room.
 *
 * The database now refuses it (lounge_message_reactions_reaction_curated,
 * applied 2026-09-11 and verified live). These are the client's half: an
 * unknown value — an old row, a reaction a future build adds, a hand-made
 * payload — goes to the END and never the front.
 */
import { summarizeReactions, applyReactionDelta, LOUNGE_REACTIONS } from '../lounge';

const rows = (...rs: [string, string, string][]) =>
  rs.map(([message_id, reaction, user_id]) => ({ message_id, reaction, user_id }));

describe('an unknown reaction goes last, never first', () => {
  it('summarizeReactions puts a value outside the five at the END', () => {
    // The defect, exactly: with indexOf's -1 this string led the row.
    const out = summarizeReactions(
      rows(
        ['m1', 'panned', 'u2'],
        ['m1', 'not-a-real-reaction', 'u3'],
        ['m1', 'bravo', 'u4'],
      ),
      'u1',
    );
    const order = out.get('m1')!.map((r) => r.reaction);
    expect(order).toEqual(['bravo', 'panned', 'not-a-real-reaction']);
  });

  it('applyReactionDelta puts one at the END too', () => {
    const next = applyReactionDelta(
      [{ reaction: 'bravo', count: 1, mine: false }],
      'zzz-unknown',
      1,
      true,
    );
    expect(next.map((r) => r.reaction)).toEqual(['bravo', 'zzz-unknown']);
  });

  it('keeps the five in their curated order, not alphabetical', () => {
    // The order is a design decision, not a side effect of sorting strings.
    const shuffled = rows(
      ['m1', 'panned', 'a'], ['m1', 'adored', 'b'], ['m1', 'quoted', 'c'],
      ['m1', 'bravo', 'd'], ['m1', 'riveting', 'e'],
    );
    expect(summarizeReactions(shuffled, 'u1').get('m1')!.map((r) => r.reaction))
      .toEqual([...LOUNGE_REACTIONS]);
  });

  it('counts each reaction and marks only the member’s own', () => {
    const out = summarizeReactions(
      rows(['m1', 'bravo', 'u1'], ['m1', 'bravo', 'u2'], ['m1', 'panned', 'u2']),
      'u1',
    ).get('m1')!;
    expect(out.find((r) => r.reaction === 'bravo')).toEqual({ reaction: 'bravo', count: 2, mine: true });
    expect(out.find((r) => r.reaction === 'panned')).toEqual({ reaction: 'panned', count: 1, mine: false });
  });

  it('drops a reaction whose last holder took it back', () => {
    const next = applyReactionDelta([{ reaction: 'bravo', count: 1, mine: true }], 'bravo', -1, true);
    expect(next).toEqual([]);
  });
});

describe('the app’s five and the database’s five are ONE list', () => {
  it('matches the CHECK constraint applied to lounge_message_reactions', () => {
    // Written out rather than imported so that adding a reaction to
    // LOUNGE_REACTIONS without adding it to the constraint FAILS here — which
    // is the only way the two stay in step. The live constraint is:
    //   CHECK (reaction = ANY (ARRAY['bravo','adored','riveting','quoted','panned']))
    expect([...LOUNGE_REACTIONS]).toEqual(['bravo', 'adored', 'riveting', 'quoted', 'panned']);
  });
});
