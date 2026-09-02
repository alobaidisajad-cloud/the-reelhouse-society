/**
 * dispatchMutationRegistry.test.ts — the Dispatch, step 2
 * ───────────────────────────────────────────────────────
 * A mutation type has to be registered in FOUR places, and only one of them
 * fails loudly when it is missed:
 *
 *   1. the type union in offlineQueue.ts        — compile error if a handler is missing
 *   2. MutationSchemaMap in types/mutations.ts  — SILENT: the flush reads
 *                                                 `if (schema)` and skips
 *                                                 validation entirely when there
 *                                                 is none
 *   3. the handler map in mutationExecutor.ts   — the one the compiler checks
 *   4. applyIdMapToPayload                      — SILENT: a dependent mutation
 *                                                 keeps its temporary offline id
 *                                                 and fails a foreign key against
 *                                                 a row that exists
 *
 * So two of the four can be forgotten without anything saying so, and the way a
 * missing schema shows up in production is a corrupt payload executing normally.
 *
 * This reads the SOURCE rather than importing the modules: mutationExecutor pulls
 * in supabase, sentry and the whole store graph, and a test that needs eight
 * mocks to ask "is this name present" ends up testing the mocks. It also means a
 * name deleted from the union cannot be quietly kept alive by a stale import.
 */
import * as fs from 'fs';
import * as path from 'path';
import { MutationSchemaMap } from '../../types/mutations';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const queueSrc = read('src/utils/offlineQueue.ts');
const execSrc = read('src/utils/mutationExecutor.ts');

/**
 * The union, taken from the declaration itself.
 *
 * Read between `type:` and the `;` that ends the property, with comments removed
 * FIRST — the union has comment lines inside it that themselves contain quoted
 * type names, and a naive scan would count those as members. That is the exact
 * trap noted in this repo before: strip comments before asserting on source.
 */
const declaredTypes: string[] = (() => {
  const clean = stripComments(queueSrc);
  const start = clean.indexOf('type:');
  const end = clean.indexOf(';', start);
  expect(start).toBeGreaterThan(-1);
  return [...clean.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
})();

/** The names this step added, so the checks below can be pointed at them. */
const DISPATCH_TYPES = [
  'add_filing', 'update_filing', 'end_filing',
  'add_critique', 'update_critique', 'remove_critique',
  'certify_filing', 'certify_critique',
  'cast_vote', 'take_answer',
  'save_filing', 'unsave_filing',
];

describe('the union is read correctly before anything is judged against it', () => {
  it('found a plausible number of types, not zero and not a stray match', () => {
    // If the parse breaks, every check below passes vacuously against an empty
    // list. This is the guard on the guard.
    expect(declaredTypes.length).toBeGreaterThan(40);
    expect(new Set(declaredTypes).size).toBe(declaredTypes.length);
    expect(declaredTypes).toEqual(expect.arrayContaining(['add_log', 'submit_report']));
  });

  it('every one of the twelve Dispatch types is in it', () => {
    for (const t of DISPATCH_TYPES) expect(declaredTypes).toContain(t);
  });
});

describe('registry 2 · a schema, or the payload is never validated at all', () => {
  it('the flush really does skip validation when there is no schema', () => {
    // The premise of this whole file. If this branch is ever changed to fail
    // closed, these checks become belt-and-braces instead of load-bearing — and
    // whoever changes it should see this test say so.
    expect(stripComments(queueSrc)).toMatch(/const schema = MutationSchemaMap\[mutation\.type\];\s*if \(schema\)/);
  });

  it('every declared type has one', () => {
    const missing = declaredTypes.filter((t) => !MutationSchemaMap[t]);
    expect(missing).toEqual([]);
  });

  it('and every Dispatch payload that owns a row demands a user_id', () => {
    // The queue partitions pending work by payload.user_id and treats a payload
    // WITHOUT one as session-scoped — safe to run for whoever is signed in when
    // the network returns. A filing is not session-scoped.
    //
    // The two toggles are exempt because they derive the member from auth.uid()
    // inside the request, so there is nothing in the payload to trust or spoof.
    const EXEMPT = new Set(['certify_filing', 'certify_critique']);
    for (const t of DISPATCH_TYPES) {
      if (EXEMPT.has(t)) continue;
      const ok = MutationSchemaMap[t].safeParse({ user_id: undefined });
      expect([t, ok.success]).toEqual([t, false]);
    }
  });
});

describe('registry 3 · a handler', () => {
  /**
   * Two forms are in use: an inline `name: async (p) => …`, and a reference to a
   * function defined above — `mark_watched: insertLog`. A scan for `: async`
   * alone reported those two as unregistered, which is the same lazy-pattern
   * mistake this repo has made before with a regex that stopped at the first
   * `>`. The map is sliced out by its own declaration and both forms are read.
   */
  const handlerNames = (() => {
    const clean = stripComments(execSrc);
    const start = clean.indexOf('const handlers: Record<');
    const end = clean.indexOf('\nconst _exhaustiveCheck', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const map = clean.slice(start, end);
    return new Set([...map.matchAll(/^\s{4}([a-z_]+):\s*(?:async|[A-Za-z_$])/gm)].map((m) => m[1]));
  })();

  it('found the handler map, not an empty set', () => {
    expect(handlerNames.size).toBeGreaterThan(40);
    expect(handlerNames.has('submit_report')).toBe(true);
  });

  it('every declared type has one', () => {
    const missing = declaredTypes.filter((t) => !handlerNames.has(t));
    expect(missing).toEqual([]);
  });

  it('and nothing is registered that no type declares', () => {
    const orphans = [...handlerNames].filter((h) => !declaredTypes.includes(h));
    expect(orphans).toEqual([]);
  });
});

describe('registry 4 · id remapping, which nothing else checks', () => {
  const idMapSrc = (() => {
    const clean = stripComments(execSrc);
    const start = clean.indexOf('export function applyIdMapToPayload');
    expect(start).toBeGreaterThan(-1);
    return clean.slice(start, clean.indexOf('\n}', start));
  })();

  /**
   * Which id fields can hold a TEMPORARY offline id?
   *
   * Only those naming a row this queue can itself create — a filing, a critique.
   * A user id never can: the member existed before the queue did. So the rule is
   * not "every field ending in _id", which would demand remapping for
   * reporter_id and target_user_id and be wrong.
   */
  const REMAPPABLE = ['id', 'post_id', 'answer_id', 'comment_id'];

  it('remaps every id that can still be a temporary one', () => {
    for (const field of REMAPPABLE) {
      expect(idMapSrc).toContain(`mapped.${field} = idMap[`);
    }
  });

  it('and the Dispatch schemas name no id field outside that list', () => {
    // If a future Dispatch mutation introduces, say, series_id as something the
    // queue can mint, this fails and points at the line to add above.
    const known = new Set([...REMAPPABLE, 'user_id', '_tempId', 'subject_id']);
    for (const t of DISPATCH_TYPES) {
      // zod exposes the shape as a function in some versions and a plain object
      // in others; asking for one form only made this throw rather than fail,
      // which reads as a broken test instead of a broken registry.
      const def = (MutationSchemaMap[t] as any)._def;
      const raw = typeof def?.shape === 'function' ? def.shape() : def?.shape;
      const shape = raw ?? {};
      expect([t, Object.keys(shape).length > 0]).toEqual([t, true]);
      for (const field of Object.keys(shape)) {
        if (!field.endsWith('id') && !field.endsWith('_id')) continue;
        expect([t, field, known.has(field)]).toEqual([t, field, true]);
      }
    }
  });
});
