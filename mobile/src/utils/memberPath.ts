/**
 * A member's file, by name, carrying their id when the opener holds it (a tapped row, a notice from
 * them): the file then reads the member's row and what it opens on together, in one trip
 * (useProfileData's knownId). Without one, the file reads the row first, as a shared address does.
 */
export function memberPath(username: string, id?: string | null): string {
  return `/user/${encodeURIComponent(username)}${id ? `?id=${encodeURIComponent(id)}` : ''}`;
}
