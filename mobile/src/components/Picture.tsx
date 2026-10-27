/**
 * Picture — the one place the app draws a picture (P4.10).
 *
 * A picture fetched from an address that failed (a poster TMDB took down, an avatar deleted, the
 * image host unreachable) left a hole, or on iOS the sepia blur that stood for "still coming",
 * for good: 84 of 87 fetched pictures had no way to say they could not be had, and some drew an
 * empty box for a film with no poster at all. Now:
 *
 *   RemoteImage  every fetched picture. With no address, or once it could not be had, its box
 *                draws `fallback`, which every site names (the member's initial, the film's
 *                mark, or null for a layer that is only light); the same fallback either way, in
 *                its own box. Kept in memory and on disk. A picture that failed for want of a
 *                connection is tried once more when the phone is back online; one the host does
 *                not have (404, 410) is not asked for again.
 *   AssetImage   the house's own pictures, bundled with the app (the logo, Buster, the marks).
 *   PosterMark   the house's mark for a film with no poster to show: ✦, faint, in its box.
 *
 * ESLint refuses expo-image anywhere else, so no picture is drawn outside these.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { onlineManager } from '@tanstack/react-query';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';

/** The host answered that it does not have the picture: asking again changes nothing. */
const NOT_THERE = /\b(404|410)\b|not found/i;

type Common = Omit<ImageProps, 'source' | 'onError' | 'cachePolicy'> & {
  /**
   * A policy other than memory-disk, for a picture drawn once and never again (an ambient blur
   * of one the screen also draws sharp); the reason is written beside it (P0.101's allow-list).
   */
  cachePolicy?: ImageProps['cachePolicy'];
};

type RemoteProps = Common & {
  /** The picture's address; none is a picture there is not. */
  uri: string | null | undefined;
  /** Drawn in the picture's place when there is none, or it could not be had; null draws nothing. */
  fallback: React.ReactNode;
  /** Told too, after the fallback is drawn: for a card that waits on its pictures before it is shared. */
  onError?: ImageProps['onError'];
};

/**
 * Where a picture's address stands: had for good ('failed'), failed for want of a connection and
 * waiting for it ('waiting'), or being tried that once more ('again').
 */
type Phase = { uri: string; phase: 'failed' | 'waiting' | 'again' };

export function RemoteImage({ uri, fallback, cachePolicy = 'memory-disk', onError, ...rest }: RemoteProps) {
  // Kept by its address: a new address (a recycled row) is tried afresh.
  const [held, setHeld] = useState<Phase | null>(null);
  const phase = held && held.uri === uri ? held.phase : null;

  useEffect(() => {
    if (phase !== 'waiting') return undefined;
    return onlineManager.subscribe((online) => {
      if (online) setHeld((h) => (h && h.phase === 'waiting' ? { ...h, phase: 'again' } : h));
    });
  }, [phase]);

  if (!uri || phase === 'failed' || phase === 'waiting') return <>{fallback}</>;
  return (
    <Image
      key={phase ?? 'first'}
      {...rest}
      source={{ uri }}
      cachePolicy={cachePolicy}
      onError={(e) => {
        const why = (e as { error?: string } | undefined)?.error ?? '';
        // Tried again once, and only for a failure the connection explains.
        const waits = phase === null && !onlineManager.isOnline() && !NOT_THERE.test(why);
        setHeld({ uri, phase: waits ? 'waiting' : 'failed' });
        onError?.(e);
      }}
    />
  );
}

type AssetProps = Common & {
  /** A picture bundled with the app: `require(...)`. */
  source: number;
  onError?: ImageProps['onError'];
};

/** The house's own pictures: bundled, so always there. */
export function AssetImage({ cachePolicy = 'memory-disk', ...rest }: AssetProps) {
  return <Image {...rest} cachePolicy={cachePolicy} />;
}

/**
 * The house's mark for a film with no poster to show: in the poster's box, never a hole. On its
 * own ground, or (ground false) on the frame it sits in, which has its own.
 */
export function PosterMark({ style, size = 18, ground = true }: { style?: StyleProp<ViewStyle>; size?: number; ground?: boolean }) {
  return (
    <View style={[s.mark, ground && s.markGround, style]}>
      <Text {...UNSPOKEN} style={[s.markText, { fontSize: size }]}>✦</Text>
    </View>
  );
}

const s = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
  markGround: { backgroundColor: colors.inkwell },
  markText: { fontFamily: fonts.display, color: colors.sepia, opacity: 0.35 },
});
