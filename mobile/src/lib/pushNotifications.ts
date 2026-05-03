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
        lightColor: '#C4961A', // Nitrate Noir sepia
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
 * Store the push token in Supabase.
 * Upserts to handle token refresh on app reinstall.
 */
async function storePushToken(userId: string, token: string): Promise<void> {
  try {
    await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: userId,
          token,
          platform: Platform.OS,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      );
  } catch {
    // Non-critical — token will be stored on next app open
  }
}

/**
 * Remove push token on logout.
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', Platform.OS);
  } catch {
    // Non-critical
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
      // #5 AUDIT FIX: Guard against malformed push payloads
      const data = response?.notification?.request?.content?.data;
      if (data) onNotificationTapped(data);
    }
  );

  return () => subscription.remove();
}
