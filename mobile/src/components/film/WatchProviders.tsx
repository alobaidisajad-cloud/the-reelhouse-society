/**
 * WatchProviders — WHERE IT PLAYS, for one named country.
 *
 * TMDB (from JustWatch) lists a film's services per country, in five kinds.
 * The list shown is the member's own country's when the phone says one, and
 * the country is always printed: another country's services passed off as the
 * member's would send them to a service that cannot play it. Each kind is
 * named for what it costs — a subscription service is never called "free".
 */
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { Image } from 'expo-image';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { tmdb } from '@/src/lib/tmdb';
import { safeOpenURL } from '@/src/utils/linking';
import { initialOf } from '@/src/utils/text';
import { deviceRegion } from '@/src/utils/deviceRegion';

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

type Kind = 'free' | 'ads' | 'flatrate' | 'rent' | 'buy';

type CountryProviders = Partial<Record<Kind, Provider[]>> & { link?: string };

/** In the order a member would rather pay: nothing first. */
export const KINDS: { kind: Kind; label: string; most: number }[] = [
  { kind: 'free', label: 'FREE', most: 6 },
  { kind: 'ads', label: 'FREE WITH ADS', most: 6 },
  { kind: 'flatrate', label: 'WITH A SUBSCRIPTION', most: 6 },
  { kind: 'rent', label: 'RENT', most: 6 },
  { kind: 'buy', label: 'BUY', most: 4 },
];

/**
 * Whose list to show. The member's own country when the phone names one, even
 * when nothing is listed there (the honest answer for them); only when it names
 * none, the US, then the first country in order. Null: no country at all.
 */
export function pickRegion(providers: Record<string, unknown> | null | undefined, mine: string | null): string | null {
  if (mine) return mine;
  const keys = Object.keys(providers ?? {});
  if (keys.includes('US')) return 'US';
  return keys.sort()[0] ?? null;
}

/** Up to two initials, for a service TMDB has no logo for. */
const monogram = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(initialOf).join('') || '?';

const ProviderLogo = React.memo(function ProviderLogo({ p, providerLink }: { p: Provider, providerLink?: string }) {
  const handlePress = React.useCallback(() => {
    if (providerLink) {
      void safeOpenURL(providerLink);
    }
  }, [providerLink]);

  const face = p.logo_path ? (
    <Image
      source={{ uri: tmdb.logo(p.logo_path, 'w154') }}
      style={s.logo}
      contentFit="cover"
      cachePolicy="memory-disk"
      placeholder={{ blurhash: SEPIA_HASH }}
      transition={50}
    />
  ) : (
    <View style={s.logoFallback}>
      <Text style={s.logoFallbackText} numberOfLines={1}>{monogram(p.provider_name)}</Text>
    </View>
  );

  // A logo is a picture: the service is named for a screen reader either way,
  // and it is a control only where there is somewhere to go.
  return providerLink ? (
    <PressableScale onPress={handlePress} haptic="light" hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
      accessibilityRole="link" accessibilityLabel={`${p.provider_name}. Opens JustWatch.`}>
      {face}
    </PressableScale>
  ) : (
    <View accessible accessibilityRole="image" accessibilityLabel={p.provider_name}>{face}</View>
  );
});

export const WatchProviders = React.memo(function WatchProviders({ providers }: { providers: Record<string, CountryProviders> | null }) {
  const region = useMemo(() => pickRegion(providers, deviceRegion()), [providers]);
  const countryData = region ? providers?.[region] ?? null : null;
  const kinds = KINDS
    .map((k) => ({ ...k, list: countryData?.[k.kind] ?? [] }))
    .filter((k) => k.list.length > 0);
  const hasAny = kinds.length > 0;
  const link = countryData?.link;

  const handleViewAll = React.useCallback(() => {
    if (link) {
      void safeOpenURL(link);
    }
  }, [link]);

  return (
    <View style={s.container}>
      <FilmSectionHeader label="WHERE IT PLAYS" />

      {!hasAny ? (
        <View style={s.emptyState}>
          <Text style={s.emptyDisplay}>Not Currently Streaming</Text>
          <Text style={s.emptyBody}>
            {region
              ? `Nothing is listed to stream, rent or buy in ${region} right now.`
              : 'Nothing is listed to stream, rent or buy right now.'}
          </Text>
        </View>
      ) : (
        <>
          <Text style={s.regionLine} numberOfLines={1}>{`LISTED FOR ${region}`}</Text>
          {kinds.map((k) => (
            <View key={k.kind} style={s.section}>
              <Text style={s.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{k.label}</Text>
              <View style={s.grid}>
                {k.list.slice(0, k.most).map((p: Provider) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          ))}

          <View style={s.footer}>
            <Text style={s.footerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>DATA BY JUSTWATCH</Text>
            {link && (
              <PressableScale onPress={handleViewAll} haptic="light" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                <Text style={s.footerLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>VIEW ALL OPTIONS →</Text>
              </PressableScale>
            )}
          </View>
        </>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  /**
   * ── UNBOXED, WITH THE REST OF THE PAGE ────────────────────────────────────
   * The provider chips are already bordered objects; a border around a group
   * of borders is a box inside a box. The only cards on this page are the
   * critiques, and those are meant to look like cards.
   */
  container: {
    marginTop: 4,
    marginBottom: 12,
  },
  emptyState: {
    paddingVertical: 8,
  },
  emptyDisplay: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.parchment,
    marginBottom: 6,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.fog,
    // Left, with the rest of the page: a centred line would be the only
    // centred thing between the hero and the shelf.
    lineHeight: 18,
  },
  regionLine: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.fogQuiet,
    marginBottom: 12,
    includeFontPadding: false,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.fog,
    marginBottom: 10,
    includeFontPadding: false,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
  },
  logoFallback: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.soot,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
    padding: 2,
  },
  logoFallbackText: {
    fontFamily: fonts.display,
    fontSize: 13,
    color: colors.fog,
    textAlign: 'center',
    includeFontPadding: false,
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,137,26,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 0.7,
    color: colors.fog,
    includeFontPadding: false,
  },
  footerLink: {
    fontFamily: fonts.sub,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.sepia,
    includeFontPadding: false,
  },
});
