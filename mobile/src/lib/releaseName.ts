/**
 * releaseName — the release and dist a crash report is filed under (P4.45).
 *
 * The release names the store build: the app's id, its version and its build number, so a crash
 * from build 41 is never read against build 42's symbols. The dist names the JavaScript that ran:
 * the update's id when one is running (its own source maps are uploaded under it), else the build's
 * own bundle. A module of its own, read by the root layout alone, as cacheBuster is: expo-updates
 * stays out of the modules most of the app imports.
 */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

const build = Platform.OS === 'ios'
  ? Constants.expoConfig?.ios?.buildNumber
  : String(Constants.expoConfig?.android?.versionCode ?? '');
const id = Platform.OS === 'ios' ? Constants.expoConfig?.ios?.bundleIdentifier : Constants.expoConfig?.android?.package;

export const SENTRY_RELEASE = `${id ?? 'com.reelhouse.society'}@${Constants.expoConfig?.version ?? '0.0.0'}+${build ?? '0'}`;
export const SENTRY_DIST = Updates.updateId ?? `build-${build ?? '0'}`;
