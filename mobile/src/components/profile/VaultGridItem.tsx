import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

export function VaultGridItem({ item, onPress }: { item: any; onPress: () => void }) {
    const posterUri = item.poster_path || item.poster ? tmdb.poster(item.poster_path || item.poster, 'w185') : null;
    return (
        <TouchableOpacity style={s.container} onPress={onPress}>
            {posterUri ? (
                <Image source={{ uri: posterUri }} style={s.image} />
            ) : (
                <View style={[s.image, { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.sepia }}>✦</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, aspectRatio: 2/3, padding: 2 },
    image: { width: '100%', height: '100%', resizeMode: 'cover', borderRadius: 4, borderWidth: 1, borderColor: colors.ash },
});
