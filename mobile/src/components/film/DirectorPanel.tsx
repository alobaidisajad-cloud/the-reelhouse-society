import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';

export function DirectorPanel({ director }: { director: any }) {
    const router = useRouter();

    if (!director) return null;

    const photoUri = director.profile_path ? tmdb.profile(director.profile_path, 'w185') : null;

    return (
        <TouchableOpacity 
            style={s.container}
            onPress={() => router.push(`/person/${director.id}`)}
            activeOpacity={0.8}
        >
            <View style={s.content}>
                <View style={s.photoWrap}>
                    {photoUri ? (
                        <Image source={{ uri: photoUri }} style={s.photo} />
                    ) : (
                        <View style={[s.photo, s.placeholder]}>
                            <Text style={s.placeholderText}>{director.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                    )}
                </View>
                <View style={s.infoWrap}>
                    <Text style={s.eyebrow}>THE AUTEUR</Text>
                    <Text style={s.name}>{director.name}</Text>
                    <Text style={s.viewText}>VIEW DOSSIER ↗</Text>
                </View>
            </View>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    container: { marginHorizontal: 16, borderWidth: 1, borderColor: colors.sepia, backgroundColor: colors.ink, borderRadius: 8, overflow: 'hidden' },
    content: { flexDirection: 'row', padding: 12, alignItems: 'center' },
    photoWrap: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: colors.ash, marginRight: 16 },
    photo: { width: '100%', height: '100%', resizeMode: 'cover' },
    placeholder: { backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { fontFamily: fonts.display, fontSize: 24, color: colors.fog },
    infoWrap: { flex: 1, justifyContent: 'center' },
    eyebrow: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 4 },
    name: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment, marginBottom: 4 },
    viewText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.fog }
});
