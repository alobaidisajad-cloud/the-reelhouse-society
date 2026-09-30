import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '../stores/settings';

// ── THE TACTILE ENGINE ──
// The app's one haptic system: nothing else imports expo-haptics. Semantic names,
// and an Android throttle guard, which keeps the haptic motor's hardware queue
// from locking up when a member spams a control (a rapid certify/uncertify).

let lastHapticTime = 0;
const HAPTIC_THROTTLE_MS = Platform.OS === 'android' ? 50 : 0;

function shouldThrottle(): boolean {
  const now = Date.now();
  if (now - lastHapticTime < HAPTIC_THROTTLE_MS) return true;
  lastHapticTime = now;
  return false;
}

class TactileEngine {
  static isEnabled() {
    if (Platform.OS === 'web') return false;
    return useSettingsStore.getState().tactileAudioEnabled;
  }

  /**
   * Selection feedback — lightest touch for toggles and selections.
   */
  static selection() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.selectionAsync();
  }

  /**
   * Light physical feedback for simple navigation or tab switching.
   */
  static navigate() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  /**
   * Medium physical feedback for standard mutations (Endorsing, Logging, Liking).
   */
  static mutate() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  /**
   * Heavy physical feedback for destructive or major actions (Deleting, Logging out).
   */
  static destroy() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  /**
   * Distinct vibration pattern for completing a flow (Signup, Auth, Long forms).
   */
  static success() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  /**
   * Distinct vibration pattern for an error or failure.
   */
  static error() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  /**
   * Warning vibration — softer than error, used for validation failures.
   */
  static warn() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  /**
   * Rigid impact — snappy, distinct tap for UI state toggles.
   */
  static rigid() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
  }

  /**
   * Soft impact — gentle swell for subtle interactions.
   */
  static soft() {
    if (!this.isEnabled() || shouldThrottle()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }
}

export default TactileEngine;
