/**
 * Push notices: the permission (read, and asked only on a press), this
 * device's token (registered with the house, removed on sign-out), and the
 * tap that opens one. What is sent is the house's notices: follows,
 * certifications, annotations and the house's own (see the Settings switches).
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { storage } from '../stores/mmkv-storage';
import * as Notifications from 'expo-notifications';
import type { NotificationResponse } from 'expo-notifications';
import { ensureNoticeChannels } from './noticeChannels';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { houseNow } from './houseClock';
import { stillSignedIn } from '../stores/domain/helpers/sessionGuard';

/**
 * This device's own token, as last registered. Sign-out removes exactly this
 * row: a member signed in on two phones keeps the other one.
 */
export const PUSH_TOKEN_KEY = 'push_token_this_device';

/** When this device's token was last registered with the house, on the house's clock. */
export const PUSH_REGISTERED_AT_KEY = 'push_token_registered_at';

/** A registration older than this is made again when the app comes back to the front. */
export const REREGISTER_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this device's token is due to be registered again: none is remembered, or the last
 * registration is over a day old. The house sends only to a token registered under a session that
 * still stands (push_tokens_of), and ties a token to its session at each registration; a phone kept
 * warm for weeks registered only at a cold launch, so a token from before round 13 stayed untied and
 * the house could only bound it by age. Registering at least daily on a return to the front keeps
 * every phone in use tied to its session.
 */
export function registrationIsDue(): boolean {
  try {
    if (!storage.getString(PUSH_TOKEN_KEY)) return true;
    const at = Number(storage.getString(PUSH_REGISTERED_AT_KEY));
    return !Number.isFinite(at) || at <= 0 || houseNow() - at > REREGISTER_AFTER_MS;
  } catch {
    return true;
  }
}

/** A notice that arrives while the app is open: a banner and in the list, with its sound and badge. */
export const FOREGROUND_NOTICES = {
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
};
// Set as the module loads, not after a token registers: a notice that arrives
// before registration, or on a phone whose registration failed, is shown too.
Notifications.setNotificationHandler(FOREGROUND_NOTICES);

// ── Type Definitions ──

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** What the operating system currently allows, from its own point of view. */
export type PushPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * Read the OS permission WITHOUT asking for it.
 *
 * Settings listed four notification switches and never said whether the device
 * would deliver anything, so all four could be on and the member hear nothing.
 *
 * This only READS. `requestPushPermission` is the only place allowed to prompt,
 * because iOS grants exactly one prompt per install — spending it on a screen
 * someone is merely inspecting spends it forever.
 *
 * A simulator, where push cannot work at all, reports `unavailable` rather than
 * an alarming `denied`.
 */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (!Device.isDevice) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask for the permission, once, on an explicit press.
 *
 * Settings is the best moment anyone will get: the member is standing over the
 * switches they just set. Returns the state AFTER asking, so the caller can
 * redraw without a second round trip.
 */
export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!Device.isDevice) return 'unavailable';
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/**
 * Register this device's token, if the member has allowed notices; never asks.
 * Must be called after the user has authenticated.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  // Push only works on physical devices
  if (!Device.isDevice) {
    logger.debug('[Push] Must use physical device for push notifications');
    return null;
  }

  try {
    // Only what the member has already allowed. iOS grants ONE prompt per install,
    // and a cold boot is the worst moment to spend it: it is asked where it means
    // something (pushPrimer.offerWord), or from Settings.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      logger.debug('[Push] Not allowed (yet): nothing to register');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    const token = tokenData.data;

    // Store token in Supabase for server-side delivery
    await storePushToken(userId, token);

    // Android's channels, one per kind (noticeChannels); made at start too, and again here harmlessly.
    await ensureNoticeChannels();

    return token;
  } catch (err) {
    if (__DEV__) console.warn('[Push] Registration failed:', err);
    return null;
  }
}

/**
 * Store the push token in Supabase via the register_push_token RPC.
 *
 * A push token identifies a physical device install, not a user. The RPC runs
 * SECURITY DEFINER so it can atomically detach the token from any previous
 * owner before claiming it for the current user (auth.uid()) — something a
 * plain client write can't do under row-level security. This is the LIB-3 fix:
 * a device that changes accounts can never keep delivering the old owner's
 * notifications.
 */
async function storePushToken(userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) {
      if (__DEV__) console.warn('[Push] register_push_token failed:', error.message);
      return;
    }
    // Signed out while the house registered it, or another member signed in: the sign-out's forget
    // may have run before this registration landed. It is forgotten again, by the token and the member
    // it was registered to (a phone claimed since by someone else keeps theirs), and the phone keeps no
    // record of it, nor lets go of a forget still owed. Unreached, the house still never sends to it:
    // its session has ended (push_tokens_of).
    if (!stillSignedIn(userId)) {
      try {
        const { error: unforgotten } = await supabase.rpc('forget_push_token', { p_token: token, p_user: userId });
        if (unforgotten) logger.warn('[Push] a registration made for a member gone is not forgotten:', unforgotten.message);
      } catch { /* as above */ }
      return;
    }
    try {
      storage.set(PUSH_TOKEN_KEY, token);
      storage.set(PUSH_REGISTERED_AT_KEY, String(houseNow()));
    } catch { /* sign-out then removes by platform */ }
    // Registered again here: a forget of this token still owed from an earlier sign-out would take
    // this registration with it. Required, not imported: endSession reads this module's key.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded late, past the import loop
    const { tokenRegisteredAgain } = require('./endSession') as typeof import('./endSession');
    tokenRegisteredAgain(token);
  } catch {
    // Non-critical — token will be re-registered on next app open
  }
}

/**
 * Forget this phone's push token: on every way a session ends here, the member's own sign-out, a
 * session ended elsewhere (a refused refresh, "Sign out of every other device" on another phone),
 * and a launch that finds the session gone.
 *
 * ── THIS ONE CANNOT FAIL QUIETLY ────────────────────────────────────────────
 * If the token survives, the phone goes on receiving the member's notices, their critiques, their
 * admissions, the names of people they follow, on a lock screen no longer signed in as them.
 *
 * It is forgotten by the token itself (forget_push_token), which needs no session: the delete
 * this replaced ran under the row's policy (`user_id = auth.uid()`), so a session already gone (a
 * refresh refused while the app was away, a session ended on another phone) matched no row,
 * PostgREST answered 200, and the token stayed, on the very path whose purpose is to stop that.
 * The token is the proof (only this phone holds it), and the member it was registered to is named
 * with it, so a phone registered since to someone else keeps theirs. Removing by platform would
 * silence the member's other phones (20260929_01), so only an install that registered before the
 * token was remembered falls back to it, which needs the session.
 *
 * @returns true if the token is gone (or none was ever there); false if it could not be forgotten,
 *          so the sign-out can owe it (endSession) and report it.
 */
export async function removePushToken(userId: string): Promise<boolean> {
  let mine: string | undefined;
  try { mine = storage.getString(PUSH_TOKEN_KEY); } catch { mine = undefined; }
  try {
    if (mine) {
      const { error } = await supabase.rpc('forget_push_token', { p_token: mine, p_user: userId });
      if (error) {
        logger.warn('[Push] token not forgotten:', error.message);
        return false;
      }
      try { storage.delete(PUSH_TOKEN_KEY); storage.delete(PUSH_REGISTERED_AT_KEY); } catch { /* nothing left to forget */ }
      return true;
    }

    // No token remembered, and notices not allowed: nothing was ever registered from this phone, so
    // nothing is left to forget. Said as a failure, every session ended elsewhere on a phone that
    // never allowed notices filed a defect report for nothing.
    let allowed = true;
    try { allowed = (await Notifications.getPermissionsAsync()).status === 'granted'; } catch { allowed = true; }
    if (!allowed) return true;

    // An install that registered before the token was remembered: the previous member's notices must
    // not reach this device, so every row of this platform goes, under the member's session.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      // No session means auth.uid() is null and the policy can match nothing: said, not shrugged at.
      logger.warn('[Push] token NOT removed: the session was already gone');
      return false;
    }
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', Platform.OS)
      .select('id');
    if (error) {
      logger.warn('[Push] token removal refused:', error.message);
      return false;
    }
    // An empty result here is fine: with a live session the policy matches this
    // member's rows, so nothing coming back means nothing was registered.
    return true;
  } catch (e) {
    logger.warn('[Push] token removal failed:', e);
    return false;
  }
}

/**
 * The notices this phone was shown, taken off it: the notification centre, the lock screen and the
 * icon's badge. Called on every way a session ends here, as the token is forgotten: the next person
 * to wake the phone read the member's notices ("@x left a critique on your log of ..."). Best effort:
 * a phone that cannot clear them still signs out.
 */
export async function clearDeliveredNotices(): Promise<void> {
  try { await Notifications.dismissAllNotificationsAsync(); } catch (e) { logger.warn('[Push] the delivered notices were not cleared:', e); }
  try { await Notifications.setBadgeCountAsync(0); } catch (e) { logger.warn('[Push] the badge was not cleared:', e); }
}


/** A notification response → its data, handed on once per notification request (pure, so testable). */
export function deliverEachTapOnce(onTap: (data: Record<string, string>) => void) {
  const delivered = new Set<string>();
  return (response: any) => {
    const request = response?.notification?.request;
    const key: unknown = request?.identifier;
    if (typeof key === 'string') {
      if (delivered.has(key)) return;
      delivered.add(key);
    }
    // Guard against malformed push payloads
    const data = request?.content?.data;
    if (data) onTap(data);
  };
}

/**
 * Hand every tapped notification to `onNotificationTapped` — exactly once.
 * Call ONCE for the life of the app (AppBootstrapper), and call what it returns
 * to stop.
 *
 * ── THE TAP THAT OPENED THE APP ─────────────────────────────────────────────
 * A listener only hears taps made while it exists. This one is attached after
 * the notifications module loads, which is after launch — so the tap that
 * LAUNCHED a closed app was never heard, and the one push a member is most
 * likely to act on did nothing. The launching response is read explicitly,
 * delivered, and cleared so it is not delivered again on the next setup.
 *
 * Both paths can see the same tap (a listener attached early enough is also
 * told of the launching one), so each notification request is delivered once,
 * by its identifier.
 */
let launchRead: Promise<NotificationResponse | null> | null = null;
let launchDelivered = false;

/**
 * The notification whose tap launched the app, read once and shared by both who ask: the tap is
 * opened from it (below), and the tabs' launch reopen stands aside for it, in app/(tabs)/_layout.tsx.
 * Read twice, the two raced to push, and a member who tapped "a new critique" could land in the
 * writing room the launch reopened instead.
 */
export function launchingNotification(): Promise<NotificationResponse | null> {
  launchRead ??= Notifications.getLastNotificationResponseAsync().catch((e: unknown) => {
    logger.warn('[Push] could not read the launching notification:', e);
    return null;
  });
  return launchRead;
}

export async function setupNotificationResponseHandler(
  onNotificationTapped: (data: Record<string, string>) => void
): Promise<(() => void) | null> {
  const deliver = deliverEachTapOnce(onNotificationTapped);
  const subscription = Notifications.addNotificationResponseReceivedListener(deliver);

  try {
    // Notifications.getLastNotificationResponseAsync(), once for the run (launchingNotification),
    // and delivered once whatever later setups ask.
    const launching = await launchingNotification();
    if (launching && !launchDelivered) {
      launchDelivered = true;
      deliver(launching);
      await Notifications.clearLastNotificationResponseAsync?.();
    }
  } catch (e) {
    logger.warn('[Push] could not read the launching notification:', e);
  }

  return () => subscription.remove();
}
