/**
 * Expo Push Notifications — The Overnight Programme
 *
 * Manages push notification registration, permissions, and token
 * storage in Supabase for server-side notification delivery.
 *
 * The three modules are imported like any other: they are installed, and the
 * Notices screen already imports expo-notifications directly. They were loaded
 * with a dynamic import "to avoid crashes if not installed" — a case that no
 * longer exists, and one that kept registration from ever running in a test.
 *
 * Notification types:
 * - Social: endorsements, follows, comments
 * - Nudges: watchlist reminders, weekly digest
 * - System: subscription expiry, feature announcements
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { logger } from '../utils/logger';
import { colors } from '../theme/theme';
import { storage } from '../stores/mmkv-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

/**
 * This device's own token, as last registered. Sign-out removes exactly this
 * row: a member signed in on two phones keeps the other one.
 */
export const PUSH_TOKEN_KEY = 'push_token_this_device';

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

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'ReelHouse',
        importance: Notifications.AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.champagne, // Nitrate Noir sepia
      });
    }

    // Configure notification behavior
    // shouldShowBanner + shouldShowList: shouldShowAlert is deprecated, and the
    // two it stood for are asked for by name.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

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
async function storePushToken(_userId: string, token: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) {
      if (__DEV__) console.warn('[Push] register_push_token failed:', error.message);
      return;
    }
    try { storage.set(PUSH_TOKEN_KEY, token); } catch { /* sign-out then removes by platform */ }
  } catch {
    // Non-critical — token will be re-registered on next app open
  }
}

/**
 * Remove push token on logout.
 *
 * ── THIS ONE CANNOT FAIL QUIETLY ────────────────────────────────────────────
 * If the token survives a logout, the device goes on receiving the PREVIOUS
 * member's notifications — their critiques, their admissions, the names of
 * people they follow — on somebody else's phone. `logout` already knows that;
 * it is why step 7 runs this BEFORE revoking the session.
 *
 * But it could not tell whether it worked, three ways over:
 *   · the delete is narrowed by `user_id`, and the policy is
 *     `user_id = auth.uid()`, so a refusal matches no row and PostgREST calls
 *     that 200 with no error;
 *   · every throw was swallowed;
 *   · and it returned `void`, so logout could not record it either.
 *
 * The case that matters is not a hostile one. It is the ordinary one: if the
 * session has ALREADY expired by the time logout runs — a refresh that failed
 * while the app was backgrounded — then `auth.uid()` is null, the delete
 * matches nothing, and the token stays. Silently, on the path whose entire
 * purpose is to stop that.
 *
 * So the session is checked first, because without one this cannot possibly
 * succeed and that is worth saying out loud. With a session, an empty result is
 * legitimate — this member simply had no token registered.
 *
 * @returns true if the token is gone (or was never there); false if the removal
 *          could not be carried out, so logout can report it.
 */
export async function removePushToken(userId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      // No session means auth.uid() is null and the policy can match nothing.
      // Reported rather than attempted-and-shrugged-at.
      logger.warn('[Push] token NOT removed: the session was already gone');
      return false;
    }

    // This device's own row. A member is heard on every device they sign in on
    // (20260929_01), so removing by platform would silence their other phone.
    // An install that registered before the token was remembered falls back to
    // the platform: the previous member's notices must not reach this device.
    let mine: string | undefined;
    try { mine = storage.getString(PUSH_TOKEN_KEY); } catch { mine = undefined; }
    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq(mine ? 'token' : 'platform', mine ?? Platform.OS)
      .select('id');

    if (error) {
      logger.warn('[Push] token removal refused:', error.message);
      return false;
    }
    try { storage.delete(PUSH_TOKEN_KEY); } catch { /* nothing left to forget */ }
    // An empty result here is fine: with a live session the policy matches this
    // member's rows, so nothing coming back means nothing was registered.
    return true;
  } catch (e) {
    logger.warn('[Push] token removal failed:', e);
    return false;
  }
}

/**
 * A notification response → its data, handed on once per notification request.
 * Pure, so the "once" can be tested without the native module (which this file
 * loads with a dynamic import Jest cannot run).
 */
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
export async function setupNotificationResponseHandler(
  onNotificationTapped: (data: Record<string, string>) => void
): Promise<(() => void) | null> {
  const deliver = deliverEachTapOnce(onNotificationTapped);
  const subscription = Notifications.addNotificationResponseReceivedListener(deliver);

  try {
    const launching = await Notifications.getLastNotificationResponseAsync();
    if (launching) {
      deliver(launching);
      await Notifications.clearLastNotificationResponseAsync?.();
    }
  } catch (e) {
    logger.warn('[Push] could not read the launching notification:', e);
  }

  return () => subscription.remove();
}
