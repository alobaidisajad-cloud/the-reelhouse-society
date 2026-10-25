import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { colors, fonts, effects, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { BusterEyes } from '@/src/components/Buster';
import { StackData, StackFilm } from './types';
import { Heart } from 'lucide-react-native';
import { useMarkCount } from '@/src/stores/markCounts';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';
import { counted } from '@/src/components/dispatch/paper/paperText';


const TMDB_IMG = 'https://image.tmdb.org/t/p/w185';

// ══════════════════════════════════════════════════════════════
//  TUNGSTEN FILAMENT FILTER CHIP
// ══════════════════════════════════════════════════════════════
/** The space between two filter chips; each reaches half of it, so no tap belongs to both. */
export const FILTER_GAP = 12;
const CHIP_HALO = { top: 10, bottom: 10, left: FILTER_GAP / 2, right: FILTER_GAP / 2 };

// The chosen chip's filament, lit and still: it breathed between half and full, and the Reel's
// light read as noise. Held at what it breathed around, drawn into the colour, not a view's opacity.
const FILAMENT = ['rgba(218,165,32,0.0)', 'rgba(218,165,32,0.3)', 'rgba(218,165,32,0.0)'] as const;

export const FilterChip = memo(function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      style={[st.filterChip, active ? st.filterChipActiveBorder : null]}
      hitSlop={CHIP_HALO}
      accessibilityState={{ selected: active }}
    >
      {active && (
        <View style={st.filterChipInner}>
          <LinearGradient colors={FILAMENT} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
        </View>
      )}
      <Text style={[st.filterChipText, active && st.filterChipTextActive]}>{label}</Text>
    </PressableScale>
  );
});

// ══════════════════════════════════════════════════════════════
//  STACK CARD — Compact Dossier Card (Parity with Web)
// ══════════════════════════════════════════════════════════════
const PRESET_GRADIENTS: readonly [string, string, ...string[]][] = [
  ['#1a0e05', '#3a2010', '#0D0B09'],
  ['#0D0B09', '#26201A', '#2a1a05'],
  ['#05080a', '#101820', '#1a2010'],
  ['#0a0508', '#1a0f18', '#0a0508'],
];

export const StackCard = memo(function StackCard({ stack, onPress }: { stack: StackData; onPress: () => void }) {
  const posters = (stack.films ?? []).filter((f: StackFilm) => f.poster_path).slice(0, 3);
  const stackIdStr = stack.id ? String(stack.id) : '';
  const refCode = stackIdStr ? `REF: ${stackIdStr.slice(0, 4).toUpperCase()}` : 'REF: 0000';
  
  const hash = stackIdStr ? stackIdStr.charCodeAt(0) : 0;
  const gradientColors = PRESET_GRADIENTS[Math.abs(hash) % PRESET_GRADIENTS.length];
  // Live: certifying on the stack's own page moves this card's number too.
  const certifyCount = useMarkCount('certify', stackIdStr, stack.certifyCount);
  const certifyShown = formatCount(certifyCount ?? 0);

  return (
    <PressableScale
      onPress={onPress}
      style={st.stackCard}
      haptic
      accessibilityLabel={`${stack.title ?? 'A stack'}. ${stack.count ?? 0} ${(stack.count ?? 0) === 1 ? 'film' : 'films'}, curated by @${stack.curator ?? 'society'}. Opens the stack.`}
    >
      <View style={st.stackCardPosterWrap}>
        {posters.length === 0 ? (
          <LinearGradient colors={gradientColors} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={st.stackCardPosterRow}>
            {posters.map((f: StackFilm, i: number) => (
              <View key={i} style={[st.stackCardPosterPanel, { width: `${100 / posters.length}%` }]}>
                <Image
                  source={{ uri: `${TMDB_IMG}${f.poster_path}` }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  placeholder={{ blurhash: SEPIA_HASH }}
                  transition={100}
                />
                {i < posters.length - 1 && (
                  <LinearGradient 
                    colors={['transparent', 'rgba(13,11,9,0.8)']} 
                    start={{ x: 0.8, y: 0 }} end={{ x: 1, y: 0 }} 
                    style={StyleSheet.absoluteFillObject} 
                  />
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      <LinearGradient 
        colors={['rgba(13,11,9,0)', 'rgba(6,5,4,0.9)', 'rgba(6,5,4,1)']} 
        locations={[0, 0.4, 0.9]} 
        style={StyleSheet.absoluteFillObject} 
      />

      <View style={st.stackCardRef}>
        <Text style={st.stackCardRefText}>{refCode}</Text>
      </View>

      <View style={st.stackCardContent}>
        <View style={st.stackCardMetaRow}>
          <Text style={st.stackCardBadgeText}>
            {(stack.count ?? 0)} {(stack.count ?? 0) === 1 ? 'FILM' : 'FILMS'}
          </Text>
          {stack.isRanked && (
            <Text style={[st.stackCertifyText, { color: colors.sepia }]}>✦ RANKED</Text>
          )}
          {/* The certify mark and its count, as every bar in the house draws
              them: the heart, then the number. It was `✦ 3` — the same star
              RANKED wears one word to the left, so the two read as one fact. */}
          {certifyShown ? (
            <View style={st.stackCertify}>
              <Heart size={9} strokeWidth={2.2} color={colors.flicker} />
              <Text style={st.stackCertifyText} accessibilityLabel={counted(certifyCount ?? 0, 'certification', 'certifications')}>
                {certifyShown}
              </Text>
            </View>
          ) : null}
          <View style={st.stackCardMetaDivider} />
        </View>

        {/* One title size across the grid and an honest ellipsis: no shrink-to-fit. */}
        <Text style={st.stackCardTitle} numberOfLines={2} ellipsizeMode="tail">{(stack.title ?? '').toUpperCase()}</Text>

        <View style={st.stackCardCuratorRow}>
          <View style={st.stackCardCuratorDot} />
          <Text style={st.stackCardCuratorName} numberOfLines={1} ellipsizeMode="tail">@{(stack.curator ?? 'society').toUpperCase()}</Text>
        </View>
      </View>
    </PressableScale>
  );
});

// ════════════════════════════════════════════════════════════════
//  TUNGSTEN SPOOLING: his eyes in the dark while a reel is read
// ════════════════════════════════════════════════════════════════
export const TungstenSpooling = memo(function TungstenSpooling() {
  return (
    <View style={st.spoolingWrap}>
      <BusterEyes />
      <Text style={st.spoolingText}>SPOOLING</Text>
    </View>
  );
});

const st = StyleSheet.create({
  filterChip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.15)',
    backgroundColor: 'rgba(30,25,20,0.5)',
  },
  // Solid fogQuiet: an unselected filter reads as unselected, not disabled.
  filterChipText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fogQuiet },
  filterChipTextActive: { color: colors.sepia, opacity: 1 },

  stackCard: {
    // The app's 1px brass dossier frame.
    flex: 1, backgroundColor: colors.inkwell,
    borderWidth: 1, borderColor: colors.sepiaBorder,
    borderRadius: 5, overflow: 'hidden',
    height: 220,
    marginBottom: 14,
    position: 'relative',
    ...effects.shadowPrimary, ...effects.flat,
  },
  stackCardPosterWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 0,
    opacity: 0.8,
  },
  stackCardPosterPanel: {
    height: '100%',
  },
  stackCardPosterRow: { flexDirection: 'row', width: '100%', height: '100%' },
  stackCardRef: {
    position: 'absolute',
    top: 8, right: 8,
    backgroundColor: 'rgba(6,5,4,0.8)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)',
    zIndex: 10,
  },
  stackCardRefText: {
    fontFamily: fonts.sub,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.parchment,
  },
  stackCardContent: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 12,
    zIndex: 10,
  },
  stackCardMetaRow: { 
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 
  },
  stackCardBadgeText: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.sepia
  },
  stackCertify: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stackCertifyText: {
    fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1.6, color: colors.flicker
  },
  stackCardMetaDivider: {
    flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.3)',
    marginLeft: 4,
  },
  stackCardTitle: {
    fontFamily: fonts.display, fontSize: 16, color: colors.parchment,
    lineHeight: 18, marginBottom: 8,
  },
  stackCardCuratorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackCardCuratorDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.sepia,
    opacity: 0.8,
  },
  stackCardCuratorName: {
    fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.fog
  },
  filterChipActiveBorder: {
    borderColor: 'rgba(218,165,32,0.6)',
  },
  filterChipInner: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: 'hidden',
  },
  spoolingWrap: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spoolingText: {
    marginTop: 18,
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 6,
    color: colors.sepia,
    ...effects.textGlowSepia,
  },
});


