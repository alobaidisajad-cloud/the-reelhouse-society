/**
 * Where a byline goes.
 * ─────────────────────────────────────────────────────────────────────────────
 * One function, because there are four bylines in the Dispatch — the feed, the
 * reader, a critique, and a series — and four hand-written template strings is
 * four chances for one of them to keep pointing at the old destination. It
 * already happened once: the design gave every byline the label "Open their
 * room" and all four opened the member FILE instead.
 *
 * ── ENCODED, ALWAYS ─────────────────────────────────────────────────────────
 * Nothing in the schema constrains what characters a handle may contain — only
 * that it is not empty and is at most 100 long. A handle with a space, a slash
 * or a `?` in it, dropped raw into a path, is a route that does not resolve or
 * resolves to the wrong screen. `useLocalSearchParams` decodes on the other
 * side, so the room reads back exactly the name that was written.
 */
export const roomOf = (username: string): string =>
  `/dispatch/room/${encodeURIComponent(username)}`;
