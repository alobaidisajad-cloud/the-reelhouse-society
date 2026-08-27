import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { tmdb } from '@/src/lib/tmdb';
import { safeOpenURL } from '@/src/utils/linking';

const getDeviceRegion = () => {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const parts = locale.split('-');
    if (parts.length > 1) {
      const regionPart = parts[1];
      if (/^[A-Za-z]{2}$/.test(regionPart)) {
        return regionPart.toUpperCase();
      }
    }
    return 'US';
  } catch {
    return 'US';
  }
};

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

interface CountryProviders {
  flatrate?: Provider[];
  rent?: Provider[];
  buy?: Provider[];
  link?: string;
}

const ProviderLogo = React.memo(function ProviderLogo({ p, providerLink }: { p: Provider, providerLink?: string }) {
  const handlePress = React.useCallback(() => {
    if (providerLink) {
      void safeOpenURL(providerLink);
    }
  }, [providerLink]);

  return (
    <PressableScale onPress={handlePress} haptic="light" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      {p.logo_path ? (
        <Image
          source={{ uri: tmdb.logo(p.logo_path) }}
          style={s.logo}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={50}
        />
      ) : (
        <View style={s.logoFallback}>
          <Text style={s.logoFallbackText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>{p.provider_name}</Text>
        </View>
      )}
    </PressableScale>
  );
});

export const WatchProviders = React.memo(function WatchProviders({ providers }: { providers: Record<string, CountryProviders> | null }) {
  const region = useMemo(() => getDeviceRegion(), []);
  const countryData = useMemo(() => {
    if (!providers) return null;
    const keys = Object.keys(providers);
    if (keys.length === 0) return null;
    return providers[region] ?? providers['US'] ?? providers[keys[0]] ?? null;
  }, [providers, region]);
  const flatrate = countryData?.flatrate ?? [];
  const rent = countryData?.rent ?? [];
  const buy = countryData?.buy ?? [];
  const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0;
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
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          <Text style={s.emptyBody}>This film isn't available on any streaming platform right now.</Text>
        </View>
      ) : (
        <>
          {flatrate.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>STREAM FREE</Text>
              <View style={s.grid}>
                {flatrate.slice(0, 6).map((p: Provider) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

          {rent.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>RENT</Text>
              <View style={s.grid}>
                {rent.slice(0, 6).map((p: Provider) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

          {buy.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>BUY</Text>
              <View style={s.grid}>
                {buy.slice(0, 4).map((p: Provider) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

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
   * The dossier and the synopsis lost their cards this pass, and leaving this
   * one framed made WHERE IT PLAYS the last boxed block — which reads as an
   * element imported from a different app rather than a deliberate emphasis.
   *
   * The provider chips are already bordered objects; a border around a group
   * of borders is a box inside a box. The only cards left on this page are the
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
    // Left, with the rest of the page. It was centred because the box it sat
    // in was centred; without the box, a centred line is the only centred
    // thing between the hero and the shelf.
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 2,
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
    backgroundColor: 'rgba(8,6,4,0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(184,137,26,0.3)',
    padding: 2,
  },
  logoFallbackText: {
    fontFamily: fonts.sub,
    fontSize: 7,
    color: colors.fog,
    textAlign: 'center',
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
    fontSize: 7,
    letterSpacing: 1.5,
    color: colors.fog,
    includeFontPadding: false,
  },
  footerLink: {
    fontFamily: fonts.sub,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.sepia,
    includeFontPadding: false,
  },
});
