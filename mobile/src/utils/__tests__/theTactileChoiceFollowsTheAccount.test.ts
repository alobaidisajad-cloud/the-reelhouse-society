/**
 * theTactileChoiceFollowsTheAccount.test.ts — review round 5
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings saves Tactile Feedback to the account (preferences.tactile_audio_enabled); the logout
 * reset turns haptics back on for whoever is next, and nothing read the account's copy back. A
 * member who turned them off, signed out and in again, felt them again under a switch saying ON.
 */
import { useAuthStore } from '@/src/stores/auth';
import { useSettingsStore } from '@/src/stores/settings';
import { followTheAccountsTactileChoice, tactileChoiceOf } from '@/src/utils/tactileFollowsTheAccount';

const member = (id: string, preferences?: Record<string, unknown>) =>
  ({ id, username: id, ...(preferences ? { preferences } : {}) }) as never;

let stop: () => void = () => {};
beforeEach(() => {
  useAuthStore.setState({ user: null } as never);
  useSettingsStore.setState({ tactileAudioEnabled: true });
});
afterEach(() => stop());

it('takes the account’s saved choice as the member signs in, after the reset turned haptics on', () => {
  stop = followTheAccountsTactileChoice();
  useAuthStore.setState({ user: member('ana', { tactile_audio_enabled: false }) } as never);
  expect(useSettingsStore.getState().tactileAudioEnabled).toBe(false);
});

it('reads it at once for the member already signed in when it starts', () => {
  useAuthStore.setState({ user: member('ana', { tactile_audio_enabled: false }) } as never);
  stop = followTheAccountsTactileChoice();
  expect(useSettingsStore.getState().tactileAudioEnabled).toBe(false);
});

it('leaves the phone’s own choice where the account holds none, and follows a later change', () => {
  stop = followTheAccountsTactileChoice();
  useSettingsStore.setState({ tactileAudioEnabled: false });
  useAuthStore.setState({ user: member('bo', { push_enabled: true }) } as never);
  expect(useSettingsStore.getState().tactileAudioEnabled).toBe(false);
  useAuthStore.setState({ user: member('bo', { tactile_audio_enabled: true }) } as never);
  expect(useSettingsStore.getState().tactileAudioEnabled).toBe(true);
});

it('reads only a true or false as a choice', () => {
  expect(tactileChoiceOf(member('a', { tactile_audio_enabled: false }))).toBe(false);
  expect(tactileChoiceOf(member('a', { tactile_audio_enabled: 'no' }))).toBeUndefined();
  expect(tactileChoiceOf(member('a'))).toBeUndefined();
  expect(tactileChoiceOf(null as never)).toBeUndefined();
});
