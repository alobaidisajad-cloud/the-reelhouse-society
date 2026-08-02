/**
 * ActionDeck.test.tsx — Module contract
 * ─────────────────────────────────────────────
 * ⚠️ ActionDeck HAS NO BEHAVIOURAL COVERAGE. This file asserts only that the module
 * exports the component. Read the note below before trusting the green tick.
 *
 * It previously held six tests. Five could not fail, and none of the five touched
 * ActionDeck — outside the export check the file never imported it:
 *
 *   • 'owner detection: shows EDIT for own logs, SAVE for others'
 *       const currentUsername = 'testuser'; const ownerUsername = 'testuser';
 *       expect(currentUsername === ownerUsername).toBe(true);
 *     An assertion that === works. Type-checking the tests is what exposed it:
 *     comparing '"testuser"' with '"otheruser"' has no overlap, so the compiler
 *     could prove the second assertion was checking something impossible.
 *
 *   • 'lounge eligibility requires archivist+ tier'
 *       const isEligible = (role: string) => role === 'archivist' || role === 'auteur';
 *     It defined a rule and then tested that rule. Worse than useless, because it is
 *     NOT how eligibility works here: the authority is src/utils/tier.ts, which
 *     resolves by tier WEIGHT and also honours is_founding — a founding member
 *     passes there and would have failed this invented check. The real rule is
 *     genuinely covered by src/utils/__tests__/tier.test.ts.
 *
 *   • 'certify toggle logic' / 'watchlist toggle logic'
 *     Built a plain object, then asserted that reading a key it had just written
 *     returned that value. Property access, not ActionDeck's use of the indexes.
 *
 *   • 'unauthenticated users get redirected (user is null)'
 *       const user = null; expect(!user).toBe(true);
 *
 * Deleted rather than repaired: repairing them would only have made a fiction
 * type-check. The honest state is recorded here instead — the component's real
 * behaviour (owner detection, endorse and watchlist toggling, tier gating, the
 * unauthenticated redirect) is not tested, and never was.
 *
 * FOLLOW-UP: give ActionDeck real rendering tests. That is coverage work rather than
 * test integrity, so it is deliberately not bundled into this batch.
 */

describe('ActionDeck module', () => {
  it('exports the ActionDeck component', () => {
    const mod = require('../feed/ActionDeck');
    expect(mod.ActionDeck).toBeDefined();
    // React.memo wraps the component as an object carrying $$typeof.
    expect(mod.ActionDeck.$$typeof).toBeDefined();
  });
});
