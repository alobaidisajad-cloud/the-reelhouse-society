/**
 * room-cover — a locked room, once opened, is never shown while the app is away.
 *
 * The app switcher (iOS) and Recents (Android) keep a picture of the last screen. An opened Archive
 * would sit there for anyone holding the phone. A cover drawn by React Native on AppState
 * `inactive` arrives too late to be sure of: iOS may take its picture first, and Android never
 * reports `inactive`. So the cover is native:
 *
 *   iOS      the house's ink laid over the window as the app resigns active, lifted as it returns
 *   Android  the open room kept out of Recents (`setRecentsScreenshotEnabled(false)`, Android 13
 *            and later, which leaves the member's own screenshots working); the secure-window flag
 *            only below Android 13, where nothing finer exists
 *
 * Absent (a test, a build without it), it does nothing: the lock itself still closes when the app
 * leaves (useArchiveLock).
 */
import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ setCovered(on: boolean): Promise<void> }>('RoomCover');

/** Covers the screen while the app is away, for as long as `on` holds. */
export function coverWhileAway(on: boolean): void {
  // A cover that could not be set is not an error to show: the lock still closes when the app leaves.
  void native?.setCovered(on).catch(() => {});
}
