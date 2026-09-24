/**
 * One decoded picture per address, shared by everything that draws it.
 * ──────────────────────────────────────────────────────────────────────────
 * The room's bloom and the copy of it a photograph's veil carries draw the
 * SAME picture, meeting at the photograph's hem. Loaded twice, they arrive at
 * different moments, and for as long as one has come and the other has not,
 * the hem shows a line. Loaded once, they arrive in the same commit.
 *
 * Held only while something is drawing it: a backdrop is a few megabytes
 * decoded, and a member browses a hundred films. The last one to let go
 * drops it.
 */
import { useEffect, useState } from 'react';
import { Skia, type SkImage } from '@shopify/react-native-skia';

interface Entry { image: Promise<SkImage | null>; users: number }
const held = new Map<string, Entry>();

function take(uri: string): Entry {
  let entry = held.get(uri);
  if (!entry) {
    entry = {
      image: Skia.Data.fromURI(uri)
        .then((data) => Skia.Image.MakeImageFromEncoded(data))
        // A picture that will not load is simply not drawn: the room is lit
        // without its bloom, as it is before the picture arrives.
        .catch(() => null),
      users: 0,
    };
    held.set(uri, entry);
  }
  entry.users += 1;
  return entry;
}

function give(uri: string) {
  const entry = held.get(uri);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users <= 0) held.delete(uri);
}

export function useSharedImage(uri: string | null | undefined): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    setImage(null);
    if (!uri) return undefined;
    let live = true;
    take(uri).image.then((img) => { if (live) setImage(img); });
    return () => { live = false; give(uri); };
  }, [uri]);
  return image;
}

/** How many pictures are held right now — for the test that proves they are let go. */
export const heldCount = () => held.size;
