/**
 * Whether the member's profile has been read: its own columns are on the user. A login's first
 * moments, and a session whose profile read gave up, carry the auth user alone — and Settings,
 * drawn from that, showed a private profile as public and saved it so. The auth user never
 * carries `is_social_private`; every profile read does (null on an older row, but there).
 */
export function profileRead(user: object | null | undefined): boolean {
  return !!user && 'is_social_private' in user;
}
