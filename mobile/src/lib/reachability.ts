/**
 * reachability.ts — the one NetInfo the app reads, set to ask the house whether it can be reached.
 *
 * An iPhone's NetInfo never hears from the phone whether the internet can be reached, so it asks
 * an address itself: by default Google's (clients3.google.com), each minute while it answers and
 * every five seconds while it does not, which told Google each minute that a member had the app
 * open, and was said nowhere (store/privacy-inventory.json). Here it asks the house's own sign-in
 * server, whose health answer reads no database: so the answer is the one the app wants (can the
 * house be reached), told to no one else. It is asked again on each change of network, else every
 * ten minutes, and each minute while the house is not reached, so a house coming back up is not
 * asked by every phone at once. An Android phone answers for itself, and nothing is asked there.
 *
 * NetInfo drops every listener when it is configured, so it is configured here, before anyone can
 * listen, and every file takes NetInfo from here (aReachabilityIsTheHouses).
 */
import NetInfo from '@react-native-community/netinfo';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

export const REACHABILITY_URL = `${SUPABASE_URL}/auth/v1/health`;
export const RECHECK_REACHED_MS = 10 * 60_000;
export const RECHECK_UNREACHED_MS = 60_000;

NetInfo.configure({
  reachabilityUrl: REACHABILITY_URL,
  reachabilityMethod: 'GET',
  reachabilityHeaders: { apikey: SUPABASE_ANON_KEY },
  reachabilityTest: (response) => Promise.resolve(response.status === 200),
  reachabilityLongTimeout: RECHECK_REACHED_MS,
  reachabilityShortTimeout: RECHECK_UNREACHED_MS,
});

export default NetInfo;
export { useNetInfo } from '@react-native-community/netinfo';
export type { NetInfoState } from '@react-native-community/netinfo';
