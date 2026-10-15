/**
 * prefetchPictures — the one way the app fetches pictures ahead
 * (imagePrefetchSites.guard.test.ts holds every caller to it).
 *
 * Each picture is fetched to the disk cache only ('disk'), where a view's own
 * load finds it; nothing fetched ahead is kept decoded in memory.
 *   · Android: expo-image's prefetch with 'disk' only downloads, through
 *     Glide's downloadOnly() (the patch under patches/). Any other policy
 *     decodes each picture whole, under a key no view asks for.
 *   · iOS: expo-image's prefetch never asks the cache first, so it would
 *     download a picture already on disk again. One already there is left out.
 *
 * A picture that fails to arrive costs nothing: its view fetches it itself.
 */
import { Image } from 'expo-image';
import { Platform } from 'react-native';

export async function prefetchPictures(urls: readonly string[]): Promise<void> {
  try {
    let missing = [...urls];
    if (Platform.OS !== 'android') {
      const paths = await Promise.all(missing.map((url) => Image.getCachePathAsync(url).catch(() => null)));
      missing = missing.filter((_, i) => !paths[i]);
    }
    if (missing.length > 0) await Image.prefetch(missing, 'disk');
  } catch {
    // Fetched ahead or not, the screen draws the same pictures.
  }
}
