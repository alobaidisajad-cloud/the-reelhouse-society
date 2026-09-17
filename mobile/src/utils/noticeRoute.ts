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

export function noticeRoute(notice: Pick<AppNotification, 'group_key' | 'film_id' | 'from_username'>): string | null {
  const about = groupRoute(parseGroupKey(notice.group_key), notice.film_id);
  if (about) return about;
  if (notice.film_id) return `/film/${notice.film_id}`;
  if (notice.from_username) return `/user/${notice.from_username}`;
  return null;
}
