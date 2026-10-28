/**
 * houseFloor — the lowest build the house still runs (WORKLIST P3.9, P4.24).
 *
 * house_settings holds one floor per platform: the native build number (iOS buildNumber,
 * Android versionCode), never `version`, which is 1.0.0 for every build. A build under it shows
 * "please update" and nothing else. The floor is kept on the phone (the boot store, which holds
 * nothing of the member's), so a phone offline at launch still knows it; it is read again in the
 * background at launch and on every return to the app, and never holds back the first screen. A
 * read that fails, or a floor never read, turns no build away.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';

import { bootStore } from './bootStore';
import { supabase } from './supabase';

/** The lowest build each platform may run, as the house last said. */
export interface HouseFloor { ios: number; android: number }

const FLOOR_KEY = 'house_floor';

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** The floor kept on the phone from the last read that answered, or none. */
export function keptFloor(): HouseFloor | null {
  try {
    const kept = bootStore().getString(FLOOR_KEY);
    if (!kept) return null;
    const floor = JSON.parse(kept) as Partial<HouseFloor>;
    return whole(floor.ios) && whole(floor.android) ? { ios: floor.ios, android: floor.android } : null;
  } catch {
    return null;
  }
}

/** Asks the house for its floor, and keeps it when it answers. A read that fails changes nothing. */
export async function readHouseFloor(): Promise<HouseFloor | null> {
  const { data, error } = await supabase.from('house_settings').select('min_build_ios, min_build_android').maybeSingle();
  if (error || !data || !whole(data.min_build_ios) || !whole(data.min_build_android)) return null;
  const floor: HouseFloor = { ios: data.min_build_ios, android: data.min_build_android };
  try { bootStore().set(FLOOR_KEY, JSON.stringify(floor)); } catch { /* read again at the next return */ }
  return floor;
}

/** This build's own number, as the phone's installed app says it; null when it does not. */
export function thisBuild(): number | null {
  const n = Number(Application.nativeBuildVersion);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Whether this build is under the floor: never when the floor or the build is unknown. */
export function belowFloor(floor: HouseFloor | null, build: number | null = thisBuild(), os: string = Platform.OS): boolean {
  if (!floor || build === null) return false;
  const lowest = os === 'ios' ? floor.ios : os === 'android' ? floor.android : 0;
  return build < lowest;
}
