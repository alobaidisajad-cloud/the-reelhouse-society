import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSettingsStore } from '../stores/settings';

// ── 10/10 DIMENSION 4: THE TACTILE ENGINE ──
// Unified haptic system.
//
// Previously 3 competing systems existed:
//   1. TactileEngine (semantic names, web guard, NO throttle) — 6 consumers
//   2. lib/haptics.ts  (throttle wrapper, NO semantics) — 2 consumers
//   3. Raw expo-haptics (no throttle, no semantics) — 37 consumers
//
// Now: Single system with BOTH semantic naming AND Android throttle guard.
// The throttle prevents the Android haptic motor hardware queue from locking
// up when users spam interactions (e.g., rapid endorse/unendorse).

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
