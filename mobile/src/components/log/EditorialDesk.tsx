import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, FlatList } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Sparkles, Check } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';

interface Props {
    dropCap: boolean;
    setDropCap: (v: boolean) => void;
    pullQuote: string;
    setPullQuote: (v: string) => void;
    editorialHeader: string | null;
    setEditorialHeader: (v: string | null) => void;
    availableBackdrops: Array<{ file_path: string }>;
}

export default function EditorialDesk({
    dropCap, setDropCap, pullQuote, setPullQuote, editorialHeader, setEditorialHeader, availableBackdrops
}: Props) {
    return (
        <View style={st.editDesk}>
            <Sparkles size={10} color={colors.sepia} strokeWidth={1.5} />
            <Text style={st.editDeskTitle}>The Editorial Desk</Text>
            
            <View style={st.editRow}>
                <Text style={st.editLabel}>STYLIZED DROP CAP</Text>
                <TouchableOpacity style={st.spoilerRow} onPress={() => { Haptics.selectionAsync(); setDropCap(!dropCap); }} activeOpacity={0.7} hitSlop={{top: 15, left: 15, bottom: 15, right: 15}}>
                    <View style={[st.cbox, dropCap && st.cboxSepia]}>{dropCap && <Check size={10} color={colors.ink} />}</View>
                    <Text style={st.editToggleText}>ENABLE</Text>
                </TouchableOpacity>
            </View>
            
            <View>
                <Text style={st.editLabel}>PULL QUOTE</Text>
                <TextInput style={st.pullQuoteInput} placeholder="Highlight a memorable line..." placeholderTextColor={colors.fog} value={pullQuote} onChangeText={setPullQuote} maxLength={120} multiline={true} textAlignVertical="top" selectionColor={'rgba(218,165,32,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} />
            </View>
            
            <View>
                <Text style={st.editLabel}>ARTICLE HEADER (STILL)</Text>
                {availableBackdrops.length > 0 ? (
                    <FlatList horizontal data={[{ file_path: '__none__' }, ...availableBackdrops]} showsHorizontalScrollIndicator={false} keyExtractor={p => p.file_path} contentContainerStyle={st.flatListGap}
                        renderItem={({ item: p }) => p.file_path === '__none__' ? (
                            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setEditorialHeader(null); }} style={[st.stillThumb, editorialHeader === null && st.stillActive]} activeOpacity={0.7}>
                                <Text style={[st.stillNone, editorialHeader === null && st.stillNoneActive]}>NONE</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setEditorialHeader(p.file_path); }} activeOpacity={0.7}>
                                <Image source={{ uri: tmdb.backdrop(p.file_path, 'w300') }} style={[st.stillImg, editorialHeader === p.file_path && st.stillImgActive, editorialHeader && editorialHeader !== p.file_path && st.stillImgFaded]} contentFit="cover" cachePolicy="memory-disk" />
                            </TouchableOpacity>
                        )}
                    />
                ) : <Text style={st.noData}>No stills found.</Text>}
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    editDesk: { padding: 16, borderWidth: 1, borderColor: colors.sepia, borderRadius: 6, backgroundColor: 'rgba(196,150,26,0.05)', gap: 16, marginBottom: 20 },
    editDeskTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.sepia },
    editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.bone, marginBottom: 8 },
    editToggleText: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog },
    pullQuoteInput: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepia, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 13, fontStyle: 'italic', color: colors.parchment },
    spoilerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cbox: { width: 16, height: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    cboxSepia: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    stillThumb: { width: 80, height: 45, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    stillActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    stillNone: { fontFamily: fonts.ui, fontSize: 8, color: colors.fog },
    stillImg: { width: 80, height: 45, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    stillImgActive: { borderWidth: 2, borderColor: colors.sepia },
    stillImgFaded: { opacity: 0.4 },
    stillNoneActive: { color: colors.ink },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },
    flatListGap: { gap: 8 },
});
