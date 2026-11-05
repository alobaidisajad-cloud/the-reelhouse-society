/**
 * Every link that opens the app passes here first (Expo Router's native intent), at launch and
 * while it runs. A link to the house's website is read into the app's own page (houseLink); the
 * app's own reelhouse:// links, and anything else, go on as they came.
 */
import { appPathOf } from '@/src/linking/houseLink';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return appPathOf(path) ?? path;
  } catch {
    return path;
  }
}
