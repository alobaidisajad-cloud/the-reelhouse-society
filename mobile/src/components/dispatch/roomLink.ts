/**
 * Where a byline goes: a member's room. One function for the four bylines in
 * the Dispatch (the feed, the reader, a critique, a series), so none can point
 * somewhere else.
 *
 * Encoded: new handles are lower letters, digits and `_` (enforce_username_policy),
 * but older ones kept what they held, and a space, a slash or a `?` dropped raw
 * into a path is the wrong route. `useLocalSearchParams` decodes it back.
 */
export const roomOf = (username: string): string =>
  `/dispatch/room/${encodeURIComponent(username)}`;
