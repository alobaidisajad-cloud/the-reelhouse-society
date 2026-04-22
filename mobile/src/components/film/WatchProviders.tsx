import React from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { Image } from 'expo-image';
import { Tv } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

/** Warm sepia-toned blurhash */
const SEPIA_HASH = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

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

export function WatchProviders({ providers }: { providers: Record<string, CountryProviders> | null }) {
  const countryData = providers ? (providers['US'] ?? providers[Object.keys(providers)[0]]) : null;
  const flatrate = countryData?.flatrate ?? [];
  const rent = countryData?.rent ?? [];
  const buy = countryData?.buy ?? [];
  const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0;
  const link = countryData?.link;

  const ProviderLogo = ({ p, providerLink }: { p: Provider, providerLink: string }) => (
    <PressableScale onPress={() => Linking.openURL(providerLink)} haptic="light" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      {p.logo_path ? (
        <Image
          source={{ uri: `https://image.tmdb.org/t/p/original${p.logo_path}` }}
          style={s.logo}
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={{ blurhash: SEPIA_HASH }}
          transition={50}
        />
      ) : (
        <View style={s.logoFallback}>
          <Text style={s.logoFallbackText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{p.provider_name}</Text>
        </View>
      )}
    </PressableScale>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Tv size={12} color={colors.bone} />
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>WHERE TO WATCH</Text>
        </View>
      </View>

      {!hasAny ? (
        <View style={s.emptyState}>
          <Text style={s.emptyDisplay}>Not Currently Streaming</Text>
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
              <PressableScale onPress={() => Linking.openURL(link)} haptic="light" hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                <Text style={s.footerLink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>VIEW ALL OPTIONS →</Text>
              </PressableScale>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4,
    padding: 16,
    marginVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.bone,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 4,
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
    textAlign: 'center',
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: fonts.ui,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.fog,
    marginBottom: 10,
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
    borderColor: 'rgba(139,105,20,0.3)',
  },
  logoFallback: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(8,6,4,0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,105,20,0.3)',
    padding: 2,
  },
  logoFallbackText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    color: colors.fog,
    textAlign: 'center',
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,105,20,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 1.5,
    color: colors.fog,
  },
  footerLink: {
    fontFamily: fonts.ui,
    fontSize: 7,
    letterSpacing: 1.5,
    color: colors.sepia,
  },
});
