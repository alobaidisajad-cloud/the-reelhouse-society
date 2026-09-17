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
import { noticeRoute } from '@/src/utils/noticeRoute';
import { nav } from '@/src/utils/typedRouter';

export const NOTICES_SHEET = '/notifications-modal';

export async function openNoticeFromPush(notificationId: string): Promise<string> {
  const store = useNotificationStore.getState();
  const notice = await store.getNotice(notificationId);
  if (notice && !notice.read) void store.markRead(notice.id);
  const route = (notice && noticeRoute(notice)) || NOTICES_SHEET;
  InteractionManager.runAfterInteractions(() => nav.push(route));
  return route;
}

/** The notice id a push carries, if it carries a usable one. */
export function noticeIdOf(data: Record<string, unknown> | null | undefined): string | null {
  const id = data?.notificationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
