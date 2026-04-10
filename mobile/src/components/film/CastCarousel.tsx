import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';

export function CastCarousel({ cast }: { cast: any[] }) {
    const router = useRouter();

    if (!cast || cast.length === 0) return null;

    const renderItem = ({ item }: { item: any }) => {
        const photoUri = item.profile_path ? tmdb.profile(item.profile_path) : null;
        return (
            <TouchableOpacity
                style={s.castCard}
                onPress={() => router.push(`/person/${item.id}`)}
                activeOpacity={0.7}
            >
                <View style={s.castPhotoWrap}>
                    {photoUri ? (
                        <>
                            <Image source={{ uri: photoUri }} style={s.castPhoto} />
                            {/* Sepia tint — matches web filter: sepia(0.15) */}
                            <View style={s.sepiaTint} />
                        </>
                    ) : (
                        <View style={[s.castPhoto, s.castPhotoPlaceholder]}>
                            <Text style={s.castPhotoPlaceholderText}>
                                {item.name?.charAt(0)?.toUpperCase() || '?'}
                            </Text>
                        </View>
                    )}
                </View>
                <Text style={s.castName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.castRole} numberOfLines={1}>{item.character}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <FlatList
            data={cast}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.listContent}
            keyExtractor={item => item.id.toString()}
            renderItem={renderItem}
        />
    );
}

const s = StyleSheet.create({
    listContent: { paddingHorizontal: 16, gap: 16 },
    castCard: { width: 100 },
    castPhotoWrap: { width: 100, height: 150, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: colors.ash, marginBottom: 8 },
    castPhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
    sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.12)', zIndex: 1 },
    castPhotoPlaceholder: { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' },
    castPhotoPlaceholderText: { fontFamily: fonts.display, fontSize: 32, color: colors.fog },
    castName: { fontFamily: fonts.display, fontSize: 14, color: colors.parchment, marginBottom: 2 },
    castRole: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia }
});
