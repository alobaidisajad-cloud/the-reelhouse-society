/**
 * openNoticeFromPush — a tapped push notification opens what it was about.
 * ─────────────────────────────────────────────────────────────────────────────
 * The only sender of push notifications (the notify-push edge function) puts
 * two things in a push's data: its `type` and the `notificationId` of the notice
 * row it announces. The app read neither. It looked for a `screen` or a `url`
 * that nothing has ever sent, so tapping any push opened the app wherever it
 * happened to be — "A New Critique" on the lock screen, and no critique.
 *
 * Now the id is the address. The notice is found (from the loaded list, or read
 * by id), marked read, and opened where its row in the notices sheet opens —
 * the same `noticeRoute`, so the two can never disagree. A notice that cannot
 * be found, or that points at nothing in particular, opens the notices sheet:
 * a tap always lands somewhere that shows the member what they were told.
 */
import { InteractionManager } from 'react-native';
import { useNotificationStore } from '@/src/stores/notificationStore';
import { useAuthStore } from '@/src/stores/auth';
import { stillSignedIn } from '@/src/stores/domain/helpers/sessionGuard';
import { noticeRoute } from '@/src/utils/noticeRoute';
import { openOrTellHere } from '@/src/utils/pageInFront';

export const NOTICES_SHEET = '/notifications-modal';

export async function openNoticeFromPush(notificationId: string): Promise<string> {
  const store = useNotificationStore.getState();
  // The member on the phone at the tap: the notice is marked read in their name alone.
  const tappedBy = useAuthStore.getState().user?.id;
  const notice = await store.getNotice(notificationId);
  if (notice && !notice.read && stillSignedIn(tappedBy)) void store.markRead(notice.id);
  const route = (notice && noticeRoute(notice)) || NOTICES_SHEET;
  // The page it is about already in front (the notices sheet open, the film on screen, the salon
  // whatever its door): a second copy is never stacked on it, and the page is told, so it reads
  // again what the notice is about (pageInFront, review round 12).
  InteractionManager.runAfterInteractions(() => { openOrTellHere(route); });
  return route;
}

/** The notice id a push carries, if it carries a usable one. */
export function noticeIdOf(data: Record<string, unknown> | null | undefined): string | null {
  const id = data?.notificationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
