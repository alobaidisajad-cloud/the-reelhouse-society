// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { Film as FilmIcon } from 'lucide-react-native';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { FilmSectionHeader } from '@/src/components/film/FilmSectionHeader';
import { tmdb } from '@/src/lib/tmdb';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';

interface StudioCardProps {
  company: {
    id: number;
    logo_path?: string | null;
    name: string;
    origin_country?: string;
  };
}

const StudioCard = memo(function StudioCard({ company }: StudioCardProps) {
  const logoUri = company.logo_path ? tmdb.posterThumb(company.logo_path) : null;
  return (
    <View style={sub.studioCard}>
      {logoUri ? (
        <Image source={{ uri: logoUri }} style={sub.studioLogo} contentFit="contain" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
      ) : (
        <View style={[sub.studioLogo, sub.studioLogoPlaceholder]}>
          <FilmIcon size={10} color={colors.fog} strokeWidth={1} />
        </View>
      )}
      <Text style={sub.studioName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{company.name}</Text>
      {company.origin_country && <Text style={sub.studioCountry}>{company.origin_country}</Text>}
    </View>
  );
});

interface FilmStudiosProps {
  studios: StudioCardProps['company'][];
}
const renderStudioItem = ({ item }: { item: StudioCardProps['company'] }) => (
  <StudioCard company={item} />
);

const keyExtractor = (item: StudioCardProps['company'], index: number) => `${item.id}-${index}`;

export const FilmStudios = memo(function FilmStudios({ studios }: FilmStudiosProps) {

  if (!studios || studios.length === 0) return null;

  return (
    <SectionErrorBoundary fallbackMessage="Production studios could not be loaded.">
      <Animated.View style={s.sectionFlush}>
        <View style={s.sectionPadded}>
          <FilmSectionHeader label="PRODUCTION" />
        </View>
        <View style={sub.studioListContainer}>
          <FlashList
            data={studios}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractor}
            contentContainerStyle={s.horizontalList}
            estimatedItemSize={90}
            snapToInterval={90}
            snapToAlignment="start"
            decelerationRate="fast"
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            renderItem={renderStudioItem}
          />
        </View>
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  sectionFlush: { marginBottom: 24, zIndex: 2 },
  sectionPadded: { paddingHorizontal: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(184,137,26,0.3)' },
  horizontalList: { paddingHorizontal: 20 },
});

const sub = StyleSheet.create({
  studioListContainer: { height: 80 },
  studioCard: { width: 80, alignItems: 'center' },
  studioLogo: { width: 60, height: 40, borderRadius: 4, marginBottom: 6, backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)' },
  studioLogoPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', justifyContent: 'center', alignItems: 'center' },
  studioName: { fontFamily: fonts.ui, fontSize: 8, color: colors.bone, textAlign: 'center', letterSpacing: 0.5 },
  studioCountry: { fontFamily: fonts.ui, fontSize: 7, color: colors.fog, letterSpacing: 1, marginTop: 2 },
});
