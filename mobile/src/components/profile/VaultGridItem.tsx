import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';
import { VaultItem } from '@/src/types';

interface VaultGridItemProps {
    item: VaultItem;
    onPress: () => void;
}

export const VaultGridItem = memo(function VaultGridItem({ item, onPress }: VaultGridItemProps) {
    const posterUri = item.poster_path ? tmdb.poster(item.poster_path, 'w185') : null;
    return (
        <TouchableOpacity style={s.container} onPress={onPress}>
            {posterUri ? (
                <Image source={{ uri: posterUri }} style={s.image} contentFit="cover" cachePolicy="memory-disk" recyclingKey={`vault-${item.id}`} />
            ) : (
                <View style={s.placeholder}>
                    <Text style={s.placeholderGlyph}>✦</Text>
                </View>
            )}
        </TouchableOpacity>
    );
});

const s = StyleSheet.create({
    container: { flex: 1, aspectRatio: 2/3, padding: 2 },
    image: { width: '100%', height: '100%', borderRadius: 4, borderWidth: 1, borderColor: colors.ash },
    placeholder: { width: '100%', height: '100%', backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center', borderRadius: 4, borderWidth: 1, borderColor: colors.ash },
    placeholderGlyph: { color: colors.sepia },
});
