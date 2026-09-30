/**
 * noticeRoute — where a notice takes the member who opens it.
 * ─────────────────────────────────────────────────────────────────────────────
 * A notice is opened from two places: its row in the notices sheet, and the
 * push notification on the lock screen. They must land in the same room, so
 * there is one answer, here.
 *
 * WHAT IT IS ABOUT, THEN WHO DID IT. The group key says what the notice is
 * about (a log, a stack, an essay, a filing) — the server declares it (#73). A
 * notice about a film with no key goes to the film. A notice with no object but
 * a person — a follow — goes to that person.
 *
 * `null` means the notice points nowhere in particular; the caller decides
 * what that means where it stands.
 */
import type { AppNotification } from '@/src/stores/notificationStore';
import { groupRoute, parseGroupKey } from '@/src/utils/endorsementGroupKey';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `lobby:<kind>:<id>` — the notice that a piece hangs in the Lobby today
 * (20260930_03). It opens the piece itself: the log, the stack, the filing.
 * Its own key, never `endorse:…`, so it is never folded into "3 members
 * certified your log".
 */
export function lobbyRoute(key: string | null | undefined): string | null {
  if (typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts.length !== 3 || parts[0] !== 'lobby' || !UUID.test(parts[2])) return null;
  const [, kind, id] = parts;
  if (kind === 'log') return `/log/${id}`;
  if (kind === 'list') return `/stacks/${id}`;
  if (kind === 'post') return `/dispatch/${id}`;
  return null;
}

export function noticeRoute(notice: Pick<AppNotification, 'group_key' | 'film_id' | 'from_username'>): string | null {
  const honoured = lobbyRoute(notice.group_key);
  if (honoured) return honoured;
  const about = groupRoute(parseGroupKey(notice.group_key), notice.film_id);
  if (about) return about;
  if (notice.film_id) return `/film/${notice.film_id}`;
  if (notice.from_username) return `/user/${notice.from_username}`;
  return null;
}
