/**
 * e2ePresent — the sealed E2E run's way to put a push on the phone as a received push is put there
 * (WORKLIST P4.22, P4.26), and nothing in any other build: only the E2E APK sets extra.e2e.
 *
 * The run sends a notice through notify-push to the Expo stand-in, reads the message it kept, and
 * opens reelhouse://e2e/present?message=<the message, as JSON>. The message is presented here through
 * expo-notifications, with its own title, body, data and channel, so Android shows it as the app's
 * own notice in its kind's channel, and a tap on it reaches the app's own tap handler
 * (setupNotificationResponseHandler) as a delivered push's would. `adb shell cmd notification post`
 * cannot: its notice belongs to com.android.shell and never reaches that handler.
 */
import * as Notifications from 'expo-notifications';
import { E2E_BUILD, e2eTrace } from './e2eTrace';

/**
 * The link the run opens (reelhouse://e2e/present?message=…, or its path alone); every other build
 * reads it as any address the app does not have.
 */
export const PRESENT_PATH = /^(?:reelhouse:\/\/|\/)?e2e\/present(?:\?|$)/;

type Message = { title?: unknown; body?: unknown; data?: unknown; channelId?: unknown };

/** The message from the link's `message` parameter, or null when there is none or it is not one. */
export function messageOf(path: string): { title: string; body: string; data: Record<string, string>; channelId: string | null } | null {
  const query = path.split('?')[1] ?? '';
  const raw = new URLSearchParams(query).get('message');
  if (!raw) return null;
  let m: Message;
  try { m = JSON.parse(raw) as Message; } catch { return null; }
  if (!m || typeof m !== 'object') return null;
  const data = m.data && typeof m.data === 'object'
    ? Object.fromEntries(Object.entries(m.data as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    : {};
  return {
    title: typeof m.title === 'string' ? m.title : '',
    body: typeof m.body === 'string' ? m.body : '',
    data,
    channelId: typeof m.channelId === 'string' && m.channelId ? m.channelId : null,
  };
}

/**
 * Presents the link's message, in the E2E build only: true when it was handed to the system. The
 * notice shows at once, in the message's channel when it names one.
 */
export async function presentFromLink(path: string): Promise<boolean> {
  if (!E2E_BUILD || !PRESENT_PATH.test(path)) return false;
  const message = messageOf(path);
  if (!message) { e2eTrace('present.refused'); return false; }
  await Notifications.scheduleNotificationAsync({
    content: { title: message.title, body: message.body, data: message.data },
    trigger: message.channelId ? { channelId: message.channelId } : null,
  });
  e2eTrace('present', { type: message.data.type ?? null, channel: message.channelId });
  return true;
}
