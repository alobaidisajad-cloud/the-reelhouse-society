/**
 * scrollBridge — Global scroll offset bridge for NavBar transparency.
 * 
 * Each tab writes its scrollY here on scroll (UI thread).
 * TopNavBar reads it to interpolate blur/tint (UI thread).
 */
import { makeMutable } from 'react-native-reanimated';

export const globalScrollY = makeMutable(0);
