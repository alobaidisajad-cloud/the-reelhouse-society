import React from 'react';
import { View, Text, StyleSheet, Image, Linking, TouchableOpacity } from 'react-native';
import { Tv } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';

export function WatchProviders({ providers }: { providers: any }) {
  const countryData = providers ? (providers['US'] || providers[Object.keys(providers)[0]]) : null;
  const flatrate = countryData?.flatrate || [];
  const rent = countryData?.rent || [];
  const buy = countryData?.buy || [];
  const hasAny = flatrate.length > 0 || rent.length > 0 || buy.length > 0;
  const link = countryData?.link;

  const ProviderLogo = ({ p, providerLink }: { p: any, providerLink: string }) => (
    <TouchableOpacity onPress={() => Linking.openURL(providerLink)} activeOpacity={0.7}>
      {p.logo_path ? (
        <Image
          source={{ uri: `https://image.tmdb.org/t/p/original${p.logo_path}` }}
          style={s.logo}
        />
      ) : (
        <View style={s.logoFallback}>
          <Text style={s.logoFallbackText} numberOfLines={2}>{p.provider_name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Tv size={12} color={colors.bone} />
          <Text style={s.title}>WHERE TO WATCH</Text>
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
              <Text style={s.sectionLabel}>STREAM FREE</Text>
              <View style={s.grid}>
                {flatrate.slice(0, 6).map((p: any) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

          {rent.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>RENT</Text>
              <View style={s.grid}>
                {rent.slice(0, 6).map((p: any) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

          {buy.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>BUY</Text>
              <View style={s.grid}>
                {buy.slice(0, 4).map((p: any) => (
                  <ProviderLogo key={p.provider_id} p={p} providerLink={link} />
                ))}
              </View>
            </View>
          )}

          <View style={s.footer}>
            <Text style={s.footerText}>DATA BY JUSTWATCH</Text>
            {link && (
              <TouchableOpacity onPress={() => Linking.openURL(link)}>
                <Text style={s.footerLink}>VIEW ALL OPTIONS →</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    padding: 16,
    marginVertical: 12,
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
  emptyState: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
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
    borderColor: 'rgba(196,150,26,0.3)',
  },
  logoFallback: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.ash,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(196,150,26,0.3)',
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
    borderTopColor: 'rgba(255,255,255,0.05)',
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
