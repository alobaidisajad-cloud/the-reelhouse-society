/**
 * Expo Push Notifications — The Overnight Programme
 *
 * Manages push notification registration, permissions, and token
 * storage in Supabase for server-side notification delivery.
 *
 * Setup:
 * 1. npx expo install expo-notifications expo-device expo-constants
 * 2. Add notification handler in _layout.tsx
 * 3. Store push tokens in Supabase `push_tokens` table
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

// ── Type Definitions ──

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

let Notifications: any = null;
let Device: any = null;
let Constants: any = null;

/**
 * Initialize the push notification system.
 * Dynamically imports expo-notifications to avoid crashes if not installed.
 */
async function loadModules() {
  try {
    Notifications = (await import('expo-notifications')).default ?? await import('expo-notifications');
    Device = (await import('expo-device')).default ?? await import('expo-device');
    Constants = (await import('expo-constants')).default ?? await import('expo-constants');
    return true;
  } catch {
    logger.debug('[Push] expo-notifications not installed — skipping');
    return false;
  }
}

/** What the operating system currently allows, from its own point of view. */
export type PushPermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/**
 * Read the OS permission WITHOUT asking for it.
 *
 * Settings listed four notification switches and never said whether the device
 * would deliver anything, so all four could be on and the member hear nothing.
 *
 * This only READS. `registerForPushNotifications` and `requestPushPermission`
 * are the only places allowed to prompt, because iOS grants exactly one prompt
 * per install — spending it on a screen someone is merely inspecting spends it
 * forever.
 *
 * Routed through the same lazy `loadModules()` as everything else here, so the
 * "expo-notifications isn't installed" case stays known in one place — and a
 * simulator, where push cannot work at all, reports `unavailable` rather than
 * an alarming `denied`.
 */
export async function getPushPermissionState(): Promise<PushPermissionState> {
  const loaded = await loadModules();
  if (!loaded || !Notifications || !Device) return 'unavailable';
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
  const loaded = await loadModules();
  if (!loaded || !Notifications || !Device) return 'unavailable';
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
 * Register for push notifications and store the token.
 * Must be called after the user has authenticated.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  const loaded = await loadModules();
  if (!loaded || !Notifications || !Device) return null;

  // Push only works on physical devices
  if (!Device.isDevice) {
    logger.debug('[Push] Must use physical device for push notifications');
    return null;
  }

  try {
    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.debug('[Push] Permission not granted');
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
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
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
    if (error && __DEV__) console.warn('[Push] register_push_token failed:', error.message);
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
 * Set up notification response handler for deep linking.
 * Call once in _layout.tsx to handle tap-to-open behavior.
 */
export async function setupNotificationResponseHandler(
  onNotificationTapped: (data: Record<string, string>) => void
): Promise<(() => void) | null> {
  const loaded = await loadModules();
  if (!loaded || !Notifications) return null;

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response: any) => {
      // Guard against malformed push payloads
      const data = response?.notification?.request?.content?.data;
      if (data) onNotificationTapped(data);
    }
  );

  return () => subscription.remove();
}
