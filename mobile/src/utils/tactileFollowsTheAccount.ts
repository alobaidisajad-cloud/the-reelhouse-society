/**
 * The member's Tactile Feedback choice, read back from their account.
 *
 * Settings saves the choice to the account (preferences.tactile_audio_enabled) and to this phone's
 * settings store; the logout reset puts haptics back on for whoever comes next. Nothing read the
 * account's copy back, so a member who turned haptics off, signed out and in again felt them
 * again under a switch that said ON (review round 5). The account's choice now follows the
 * member: whenever the signed-in member, or their saved choice, changes, the store takes it.
 */
import { useAuthStore } from '@/src/stores/auth';
import { useSettingsStore } from '@/src/stores/settings';

type Member = ReturnType<typeof useAuthStore.getState>['user'];

/** The account's saved choice, or undefined when it holds none (the phone's own stands). */
export function tactileChoiceOf(user: Member): boolean | undefined {
  const saved = (user?.preferences as { tactile_audio_enabled?: unknown } | undefined)?.tactile_audio_enabled;
  return typeof saved === 'boolean' ? saved : undefined;
}

/** Lays the account's choice on the store now, and whenever it changes. Returns the unsubscribe. */
export function followTheAccountsTactileChoice(): () => void {
  const lay = (user: Member) => {
    const saved = tactileChoiceOf(user);
    if (saved !== undefined && saved !== useSettingsStore.getState().tactileAudioEnabled) {
      useSettingsStore.setState({ tactileAudioEnabled: saved });
    }
  };
  lay(useAuthStore.getState().user);
  return useAuthStore.subscribe((s, prev) => {
    if (s.user?.id !== prev.user?.id || tactileChoiceOf(s.user) !== tactileChoiceOf(prev.user)) lay(s.user);
  });
}
