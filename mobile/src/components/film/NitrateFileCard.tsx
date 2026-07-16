/**
 * NitrateFileCard — THE NITRATE FILE.
 * ─────────────────────────────────────────────────────────────
 * The Society's shareable artifact: a frame of nitrate stock pulled
 * from the archive. One template serves every share surface (film
 * page + log page) so a ReelHouse file looks identical everywhere.
 *
 * Reliability law — the geometry is deterministic for ANY content:
 *   · fixed 360×640 canvas (ViewShot renders off-screen, device-blind)
 *   · the poster zone is the ONLY flexible region; it absorbs all variance
 *   · critique zone: pull quote → review → HIDDEN. Hard 3-line clamp.
 *     No filler text, ever — an empty log grows the poster instead.
 *   · the stamp anchors to the slab with ≥10px inset from every clip
 *     edge, so its −8° rotation can never touch the overflow boundary
 *   · title shrinks to fit 2 lines; rating row renders only when > 0;
 *     MEMBER Nº renders only when the real serial reached this client.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';
import { stripHtml } from '@/src/utils/html';
import { truncateReview } from '@/src/utils/text';

export const NITRATE_CARD_WIDTH = 360;
export const NITRATE_CARD_HEIGHT = 640;
/** Pinned export resolution — 9:16 story-native, identical on every device. */
export const NITRATE_EXPORT_WIDTH = 1080;
export const NITRATE_EXPORT_HEIGHT = 1920;

export interface NitrateFileData {
  title: string;
  year?: string | null;
  posterUrl: string | null | undefined;
  rating?: number | null;
  review?: string | null;
  pullQuote?: string | null;
  /** undefined/null → film-only share: no stamp on the file. */
  status?: string | null;
  username?: string | null;
  memberNo?: number | null;
}

// Sprocket holes down the left edge — the strip this frame was cut from.
const PERF_HOLES = Array.from({ length: 14 }, (_, i) => i);

export function NitrateFileCard({ data }: { data: NitrateFileData }) {
  const rating = data.rating ?? 0;
  const pullQuote = data.pullQuote?.trim() || null;
  const review = data.review ? truncateReview(stripHtml(data.review), 260) : null;
  // The critique zone's priority law: the author's own chosen line first.
  const critique = pullQuote ?? review;
  const critiqueIsQuote = !!pullQuote;

  const isAbandoned = data.status === 'abandoned';
  const stampText = data.status
    ? (isAbandoned ? 'ABANDONED' : 'SCREENED & FILED')
    : null;

  const memberNoDisplay = data.memberNo
    ? `MEMBER Nº ${String(data.memberNo).padStart(4, '0')}`
    : 'REELHOUSE.APP';

  return (
    <View style={s.canvas}>
      {/* Ambient nitrate glow behind the slab */}
      {data.posterUrl ? (
        <Image source={{ uri: data.posterUrl }} style={s.ambient} contentFit="cover" blurRadius={40} />
      ) : (
        <LinearGradient
          colors={['rgba(184,137,26,0.08)', 'rgba(4,3,2,0)']}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 1 }}
          style={s.ambient}
        />
      )}
      <View style={s.vignette} />

      {/* The perforation rail — sprocket holes of the strip */}
      <View style={s.perfRail}>
        {PERF_HOLES.map((i) => (
          <View key={i} style={s.perfHole} />
        ))}
      </View>

      {/* The slab — the filed frame */}
      <View style={s.slab}>
        {/* Registration brackets — the archivist's alignment marks */}
        <View style={[s.bracket, s.bracketTL]} />
        <View style={[s.bracket, s.bracketTR]} />
        <View style={[s.bracket, s.bracketBL]} />
        <View style={[s.bracket, s.bracketBR]} />

        {/* The lockup — the eye above the name */}
        <View style={s.lockup}>
          <Image source={require('@/assets/images/reelhouse-logo.png')} style={s.lockupSeal} />
          <Text style={s.lockupWordmark}>✦ THE REELHOUSE SOCIETY ✦</Text>
        </View>

        {/* Poster zone — the only flexible region; absorbs all variance */}
        <View style={s.posterZone}>
          <View style={s.posterFrame}>
            {data.posterUrl ? (
              <Image source={{ uri: data.posterUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            ) : (
              <LinearGradient colors={['#15120e', '#090705']} style={s.posterFallback}>
                <View style={s.posterFallbackRule} />
                <Text style={s.posterFallbackMark}>✦</Text>
                <Text style={s.posterFallbackTitle} numberOfLines={3}>{data.title}</Text>
                {!!data.year && <Text style={s.posterFallbackYear}>{data.year}</Text>}
              </LinearGradient>
            )}
          </View>

          {/* The stamp — logged files only; inset ≥10px from every clip edge */}
          {stampText && (
            <View style={[s.stamp, isAbandoned && s.stampAbandoned]}>
              <Text style={[s.stampText, isAbandoned && s.stampTextAbandoned]}>{stampText}</Text>
            </View>
          )}
        </View>

        {/* Identity — title, year, verdict */}
        <View style={s.identity}>
          <Text style={s.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {data.title}
          </Text>
          <View style={s.metaRow}>
            {!!data.year && <Text style={s.metaYear}>{data.year}</Text>}
            {rating > 0 && (
              <>
                {!!data.year && <Text style={s.metaDot}>·</Text>}
                <ReelRating rating={rating} size={12} />
              </>
            )}
          </View>
        </View>

        {/* The critique zone — pull quote → review → hidden. Never filler. */}
        {critique && (
          <View style={s.critiqueZone}>
            {critiqueIsQuote ? (
              <Text style={s.critiqueQuote} numberOfLines={3}>« {critique} »</Text>
            ) : (
              <Text style={s.critiqueProse} numberOfLines={3}>&ldquo;{critique}&rdquo;</Text>
            )}
          </View>
        )}

        {/* The ledger line */}
        <View style={s.footer}>
          <Text style={s.footerSerial} numberOfLines={1}>{memberNoDisplay}</Text>
          {!!data.username && (
            <Text style={s.footerHandle} numberOfLines={1}>@{data.username.toUpperCase()}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  canvas: {
    width: NITRATE_CARD_WIDTH,
    height: NITRATE_CARD_HEIGHT,
    backgroundColor: '#040302',
    overflow: 'hidden',
  },
  ambient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
    transform: [{ scale: 1.15 }],
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,3,2,0.45)',
  },

  // ── The perforation rail ──
  perfRail: {
    position: 'absolute',
    left: 9,
    top: 26,
    bottom: 26,
    width: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  perfHole: {
    width: 9,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#0A0906',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.28)',
  },

  // ── The slab ──
  slab: {
    position: 'absolute',
    left: 32,
    right: 16,
    top: 22,
    bottom: 22,
    backgroundColor: '#090705',
    borderWidth: 1,
    borderColor: colors.sepiaBorder,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.8,
    shadowRadius: 30,
    elevation: 10,
  },
  bracket: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: 'rgba(184,137,26,0.5)',
    zIndex: 2,
  },
  bracketTL: { top: 7, left: 7, borderTopWidth: 1, borderLeftWidth: 1 },
  bracketTR: { top: 7, right: 7, borderTopWidth: 1, borderRightWidth: 1 },
  bracketBL: { bottom: 7, left: 7, borderBottomWidth: 1, borderLeftWidth: 1 },
  bracketBR: { bottom: 7, right: 7, borderBottomWidth: 1, borderRightWidth: 1 },

  // ── The lockup ──
  lockup: {
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,137,26,0.15)',
  },
  lockupSeal: {
    width: 30,
    height: 30,
    marginBottom: 6,
  },
  lockupWordmark: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    includeFontPadding: false,
  },

  // ── Poster zone ──
  posterZone: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    paddingBottom: 10,
  },
  posterFrame: {
    height: '100%',
    aspectRatio: 2 / 3,
    backgroundColor: colors.soot,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 8,
  },
  posterFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  posterFallbackRule: {
    position: 'absolute',
    top: 6, bottom: 6, left: 6, right: 6,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.12)',
  },
  posterFallbackMark: {
    fontFamily: fonts.sub,
    fontSize: 12,
    color: colors.sepia,
    opacity: 0.7,
    marginBottom: 8,
  },
  posterFallbackTitle: {
    fontFamily: fonts.display,
    fontSize: 13,
    lineHeight: 17,
    color: colors.parchment,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 4,
  },
  posterFallbackYear: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
    textAlign: 'center',
  },

  // ── The stamp ──
  stamp: {
    position: 'absolute',
    right: 18,
    bottom: 14,
    transform: [{ rotate: '-8deg' }],
    borderWidth: 2,
    borderColor: 'rgba(184,137,26,0.75)',
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(9,7,5,0.55)',
  },
  stampAbandoned: {
    borderColor: 'rgba(180,45,45,0.75)',
  },
  stampText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.champagne,
    includeFontPadding: false,
  },
  stampTextAbandoned: {
    color: colors.crimson,
  },

  // ── Identity ──
  identity: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 27,
    color: colors.parchment,
    textAlign: 'center',
    includeFontPadding: false,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    minHeight: 14,
  },
  metaYear: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 3,
    color: colors.sepia,
    includeFontPadding: false,
  },
  metaDot: {
    fontSize: 9,
    color: colors.sepiaBorder,
  },

  // ── The critique zone — hard 3-line clamp, hidden when empty ──
  critiqueZone: {
    marginTop: 10,
    marginHorizontal: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderLeftWidth: 2,
    borderLeftColor: colors.sepia,
    borderRadius: 2,
  },
  critiqueQuote: {
    fontFamily: fonts.display,
    fontSize: 14,
    lineHeight: 20,
    color: colors.sepia,
  },
  critiqueProse: {
    fontFamily: fonts.bodyItalic,
    fontSize: 12,
    lineHeight: 18,
    color: colors.bone,
    opacity: 0.95,
  },

  // ── The ledger line ──
  footer: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,137,26,0.15)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  footerSerial: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.sepia,
    includeFontPadding: false,
  },
  footerHandle: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.flicker,
    includeFontPadding: false,
    flexShrink: 1,
    marginLeft: 12,
  },
});
