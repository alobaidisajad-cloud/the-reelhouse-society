/**
 * aShelfIsNeverHeldHostage.test.ts — the two gates that pointed the wrong way.
 * ─────────────────────────────────────────────────────────────────────────────
 * `archiveSlice` gated all four Physical Archive operations on the viewer's
 * rank: fetch, add, update, remove. Two of those were wrong, and both were
 * wrong in the same direction — against the member.
 *
 *   fetchPhysicalArchive   refused to LOAD the shelf, so a lapsed Archivist
 *                          opened their own Physical Archive and saw nothing.
 *                          Their own collection, invisible — not because the
 *                          server refused it, but because the client would not
 *                          ask. The policy is `Users can read own archive` on
 *                          `auth.uid() = user_id` with no tier clause anywhere
 *                          near it, so the gate was STRICTER THAN THE DATABASE
 *                          and the only thing it protected a member from was
 *                          their own records.
 *
 *   removeFromPhysicalArchive
 *                          refused to REMOVE an item, trapping those records in
 *                          a room the member could no longer enter. They could
 *                          neither change an entry nor take it out.
 *
 * The rule, and it now matches `enforce_log_tier_fields` — which had it right
 * all along for logs: a member who stops paying keeps what they made, may
 * always read it, and may always withdraw it. Adding and changing are the paid
 * acts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '..', 'archiveSlice.ts'), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

/**
 * The IMPLEMENTATION body of one operation.
 *
 * `indexOf(name + ':')` finds the interface TYPE DECLARATION at the top of the
 * file first — `fetchPhysicalArchive: (userId?: string) => Promise<...>;` — and
 * a type signature naturally contains no tier check, so two of the assertions
 * below passed against it VACUOUSLY on the first run. The arrow-and-brace form
 * is what distinguishes the implementation, and `mustBeRealBody` refuses to
 * return a signature ever again.
 */
const opBody = (name: string): string => {
  const impl = new RegExp(`${name}:\\s*(async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`);
  const m = impl.exec(CODE);
  if (!m) return '';
  const from = (m.index ?? 0) + m[0].length;
  const rest = CODE.slice(from);
  const next = rest.search(/\n {4}[a-zA-Z_]+:\s*(async\s*)?\(/);
  const body = next === -1 ? rest : rest.slice(0, next);
  // A signature has no statements in it. This is the tripwire.
  if (!/\breturn\b|\bconst\b|\bset\(|\bget\(/.test(body)) {
    throw new Error(`opBody('${name}') matched something with no statements — a type, not a body`);
  }
  return body;
};

describe('a shelf is never held hostage', () => {
  it('the scan can find all four operations — not passing on an empty read', () => {
    for (const op of [
      'fetchPhysicalArchive', 'addToPhysicalArchive',
      'updatePhysicalArchiveItem', 'removeFromPhysicalArchive',
    ]) {
      expect(`${op}: ${opBody(op).length > 80}`).toBe(`${op}: true`);
    }
  });

  describe('what a member may always do with their own records', () => {
    it('READ them — loading a shelf asks no rank', () => {
      // The gate that hid a lapsed member's own collection from them.
      expect(opBody('fetchPhysicalArchive')).not.toMatch(/isArchivistPlusTier/);
    });

    it('WITHDRAW them — removing asks no rank', () => {
      // Taking your own things back is not a paid act.
      expect(opBody('removeFromPhysicalArchive')).not.toMatch(/isArchivistPlusTier/);
    });
  });

  describe('what the rank is actually for', () => {
    it('ADDING to the shelf still asks for it', () => {
      expect(opBody('addToPhysicalArchive')).toMatch(/isArchivistPlusTier/);
    });

    it('CHANGING an entry still asks for it', () => {
      expect(opBody('updatePhysicalArchiveItem')).toMatch(/isArchivistPlusTier/);
    });
  });

  it('and the session guard survived the change to the fetch', () => {
    // Removing the tier test meant removing the line that read `user`, which
    // the staleness guard below it needs — `stillSignedIn(user?.id)` is what
    // stops a fetch resolving into the next member's session. It compiled only
    // because the variable was put back deliberately.
    const body = opBody('fetchPhysicalArchive');
    expect(body).toMatch(/stillSignedIn\(user\?\.id\)/);
    expect(body).toMatch(/const user = useAuthStore\.getState\(\)\.user;/);
  });
});
