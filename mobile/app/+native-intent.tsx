/**
 * Every link that opens the app passes here first (Expo Router's native intent), at launch and
 * while it runs. A link to the house's website is read into the app's own page (houseLink); the
 * app's own reelhouse:// links, and anything else, go on as they came. In the sealed E2E build alone,
 * reelhouse://e2e/present puts a notice on the phone as a delivered push (e2ePresent) and opens the
 * Lobby; every other build reads that address as one the app does not have.
 */
import { appPathOf } from '@/src/linking/houseLink';
import { E2E_BUILD } from '@/src/utils/e2eTrace';
import { PRESENT_PATH, presentFromLink } from '@/src/utils/e2ePresent';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (E2E_BUILD && PRESENT_PATH.test(path)) {
      void presentFromLink(path);
      return '/';
    }
    return appPathOf(path) ?? path;
  } catch {
    return path;
  }
}
