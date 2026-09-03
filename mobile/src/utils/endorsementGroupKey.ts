/**
 * What an endorsement group is ABOUT — parsed from the key the database wrote.
 *
 * ── #73 · WHY THE SERVER DECLARES THIS AND THE CLIENT NEVER INFERS IT ────────────────
 * Grouping used to identify a group two ways, and both were dead:
 *
 *   1. by `film_id` — which the notification trigger has never written
 *   2. by reading the message with /your review of (.+)$/ — while the trigger writes
 *      "certified your log of Metropolis."
 *
 * The second one is the instructive failure. A migration rewrote the notification copy
 * because "the user literally could not understand a push", and silently disabled
 * grouping in the process: the parser was never mentioned, because nothing connected
 * the two. Every endorsement has fallen through to an individual row ever since.
 *
 * Repairing the regex to match today's wording would re-arm exactly that trap for the
 * next copy edit. So identity is now DECLARED by the writer — a `group_key` column the
 * trigger fills — and the client's only job is to read it. Copy can change freely.
 *
 * ── WHY A KEY AND NOT JUST film_id ───────────────────────────────────────────────────
 * THREE different actions write an `endorse` notification: certifying a log, a stack,
 * or a dossier. Only logs have a film. Keying on the film would have fixed one third of
 * the feature and left stacks and dossiers permanently ungrouped — the same complaint,
 * moved rather than answered.
 *
 * The key therefore carries the KIND and the TARGET's id, which is enough to group
 * them, label them, and route a tap to the right screen. One stored value, three
 * correct behaviours, and no branch anyone can forget to add.
 */
/**
 * `post` is the Dispatch: one table holds all five kinds of filing, so the key
 * cannot name the kind — a take, a seeking, a wire, a ballot and a dossier all
 * live at the same address and the group is about the FILING, not its form.
 *
 * `dossier` stays. Every notification written before the Dispatch shipped
 * carries `endorse:dossier:<id>`, and those are on members' devices — dropping
 * it would turn each one into a dead tap. It routes to the same reader by way of
 * the redirect that address already has.
 */
export type EndorseKind = 'log' | 'list' | 'dossier' | 'post';

export interface EndorseTarget {
  kind: EndorseKind;
  /** The id of the log / stack / dossier that was certified. */
  id: string;
}

const KINDS: Record<string, EndorseKind> = {
  log: 'log', list: 'list', dossier: 'dossier', post: 'post',
};

/**
 * `endorse:log:<uuid>` → `{ kind: 'log', id: '<uuid>' }`
 *
 * Returns null for anything unrecognised, so a key written by a newer server than this
 * client understands degrades to "ungrouped" rather than throwing inside a render.
 */
export function parseGroupKey(key: string | null | undefined): EndorseTarget | null {
  if (typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [prefix, rawKind, id] = parts;
  if (prefix !== 'endorse') return null;
  const kind = KINDS[rawKind];
  if (!kind || !id) return null;
  return { kind, id };
}

/**
 * The sentence shown on a collapsed group.
 *
 * Built here rather than on the server because it depends on the COUNT, which only the
 * client knows after grouping. The noun comes from the kind, so a stack is never
 * described as a review — the old copy said "endorsed your review of …" for everything,
 * and would have read "endorsed your review of your review" once grouping worked,
 * because the film name came from the same broken regex.
 */
export function describeGroup(count: number, kind: EndorseKind, title?: string): string {
  const people = count === 1 ? '1 member' : `${count} members`;
  const named = (title ?? '').trim();

  switch (kind) {
    case 'list':
      return named ? `${people} certified your stack “${named}”` : `${people} certified your stack`;
    case 'post':
      // The kind is not in the key — five forms share one table — so the group
      // says "filing" unless the title names the thing, which for a dossier and
      // a ballot it does.
      return named ? `${people} certified your filing “${named}”` : `${people} certified your filing`;
    case 'dossier':
      return named ? `${people} certified your dossier “${named}”` : `${people} certified your dossier`;
    case 'log':
    default:
      return named ? `${people} certified your log of ${named}` : `${people} certified your log`;
  }
}

/**
 * Where tapping a group should go.
 *
 * The old handler routed by `film_id` and nothing else, so a stack or dossier group
 * would have closed the sheet and navigated nowhere — a dead button that only appears
 * once grouping starts working. Every kind now has a destination, and all three routes
 * exist (`/film/[id]`, `/stacks/[id]`, `/dossier/[id]`).
 *
 * Logs route to the FILM because there is no per-log screen; that also matches what the
 * individual-notification row already does.
 */
export function groupRoute(target: EndorseTarget | null, filmId?: number): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'log':
      return filmId ? `/film/${filmId}` : null;
    case 'list':
      return `/stacks/${target.id}`;
    case 'post':
      return `/dispatch/${target.id}`;
    case 'dossier':
      // The old address, which redirects. Kept rather than rewritten to
      // `/dispatch/` here: every notification carrying this key was written
      // before the reader moved, and the redirect is what makes those work — so
      // this route is exercised by real taps rather than being a door nobody
      // uses, which is how a redirect quietly rots.
      return `/dossier/${target.id}`;
    default:
      return null;
  }
}
