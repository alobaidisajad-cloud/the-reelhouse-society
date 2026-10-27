/**
 * cacheBuster — the build and the update a saved query cache was written by (P4.11).
 *
 * A cache written by any other is not painted, but thrown away and read afresh: an update can change
 * what a read returns, and an old shape painted by new code drew wrong, or not at all. Not the app's
 * version, which is 1.0.0 for every build (and the runtime version follows it): the store build
 * number, and the id of the running update, embedded or over the air. A module of its own, read by
 * the root layout alone: the query client, which most of the app imports, needs no native module.
 */
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export const CACHE_BUSTER = [
  Platform.OS,
  Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : Constants.expoConfig?.android?.versionCode,
  Updates.updateId ?? 'no-update',
].join(':');
