import { useCallback, memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useRouter } from 'expo-router';
import { tmdb } from '@/src/lib/tmdb';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';

interface CastMember {
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
}

const keyExtractor = (item: CastMember, index: number) => `${item.id}-${index}`;

const CastCard = memo(function CastCard({ item }: { item: CastMember }) {
    const handlePress = useCallback(() => {
        if (item.id) {
            nav.push(`/person/${item.id}`);
        }
    }, [item.id]);

    const photoUri = item.profile_path ? tmdb.profile(item.profile_path) : null;
    return (
        <PressableScale
            style={s.castCard}
            onPress={handlePress}
            haptic="selection"
        >
            <View style={s.castPhotoWrap}>
                {photoUri ? (
                    <>
                        <Image source={{ uri: photoUri }} style={s.castPhoto} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
                        {/* Sepia tint — matches web filter: sepia(0.15) */}
                        <View style={s.sepiaTint} />
                    </>
                ) : (
                    <View style={[s.castPhoto, s.castPhotoPlaceholder]}>
                        <Text style={s.castPhotoPlaceholderText}>
                            {item.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </Text>
                    </View>
                )}
            </View>
            <Text style={s.castName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.name}</Text>
            <Text style={s.castRole} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.character}</Text>
        </PressableScale>
    );
});

const CarouselSeparator = () => <View style={{ width: 16 }} />;

export const CastCarousel = memo(function CastCarousel({ cast }: { cast: CastMember[] }) {
    const renderItem = useCallback(({ item }: { item: CastMember }) => {
        return <CastCard item={item} />;
    }, []);

    if (!cast || cast.length === 0) return null;

    return (
        <View style={{ height: 195 }}>
            <FlashList
                data={cast}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.listContent}
                keyExtractor={keyExtractor}
                estimatedItemSize={116}
                ItemSeparatorComponent={CarouselSeparator}
                renderItem={renderItem}
            />
        </View>
    );
})

const s = StyleSheet.create({
    listContent: { paddingHorizontal: 16 },
    castCard: { width: 100 },
    castPhotoWrap: { width: 100, height: 150, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)', marginBottom: 8 },
    castPhoto: { width: '100%', height: '100%' },
    sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.12)', zIndex: 1 },
    castPhotoPlaceholder: { backgroundColor: 'rgba(8,6,4,0.98)', justifyContent: 'center', alignItems: 'center' },
    castPhotoPlaceholderText: { fontFamily: fonts.display, fontSize: 32, color: colors.fog },
    castName: { fontFamily: fonts.display, fontSize: 14, color: colors.parchment, marginBottom: 2 },
    castRole: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia }
});
