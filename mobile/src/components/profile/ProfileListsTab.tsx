import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LayoutList } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { colors, fonts } from '../../theme/theme';
import { tmdb } from '../../lib/tmdb';
import type { ProfileList, ProfileListFilm } from '../../types';
import PressableScale from '../PressableScale';

interface ProfileListsTabProps {
  lists: ProfileList[];
}

const SEPIA_HASH = "L9D]2+?]00Mw%iRjIUj]~W00D%~W";

export default function ProfileListsTab({ lists }: ProfileListsTabProps) {
  const router = useRouter();

  return (
    <View style={s.tabContentPad}>
      {lists.length === 0 ? (
        <View style={s.emptyState}>
          <LayoutList size={32} color={colors.sepia} strokeWidth={1} style={s.emptyLockIcon} />
          <Text style={s.emptyTitle}>The Stacks are Empty</Text>
          <Text style={s.emptyDesc}>No lists yet.</Text>
        </View>
      ) : (
        <View style={s.stacksGrid}>
          {lists.map((list) => {
            const posters = (list.films || [])
              .filter((f: ProfileListFilm) => f.poster)
              .slice(0, 3)
              .map((f: ProfileListFilm) => tmdb.poster(f.poster || '', 'w185'));

            return (
              <PressableScale 
                key={list.id} 
                style={s.stackCard} 
                onPress={() => router.push({ pathname: '/list-modal', params: { listId: list.id } })}
                haptic
              >
                <View style={s.stackPosterWrap}>
                  {posters.length > 0 ? (
                    posters.map((uri: string, i: number) => (
                      <Image 
                        key={i} 
                        source={{ uri }} 
                        style={[s.stackPosterPanel, { left: `${(i * 100) / posters.length}%`, width: `${100 / posters.length}%` }]} 
                      />
                    ))
                  ) : (
                    <View style={s.stackEmptyBg} />
                  )}
                  <View style={s.stackOverlay} />
                </View>
                <View style={s.stackContent}>
                  <Text style={s.stackBadge}>{(list.films || []).length} FILMS</Text>
                  <Text style={s.stackTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{(list.title || '').toUpperCase()}</Text>
                  {list.description ? (
                    <Text style={s.stackDesc} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{list.description}</Text>
                  ) : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tabContentPad: { paddingHorizontal: 16, paddingTop: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', backgroundColor: 'rgba(8,6,4,0.98)' },
  emptyLockIcon: { marginBottom: 16, opacity: 0.6 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.parchment, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontFamily: fonts.body, fontSize: 10, color: colors.fog, fontStyle: 'italic', textAlign: 'center', lineHeight: 16 },
  stacksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between' },
  stackCard: { width: '47%', marginBottom: 16 },
  stackPosterWrap: { width: '100%', aspectRatio: 3 / 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(18,14,9,0.5)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.2)', position: 'relative' },
  stackPosterPanel: { position: 'absolute', top: 0, bottom: 0, height: '100%', resizeMode: 'cover' },
  stackEmptyBg: { flex: 1, backgroundColor: 'rgba(18,14,9,0.7)' },
  stackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,4,3,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderRadius: 6 },
  stackContent: { paddingTop: 10, paddingHorizontal: 4 },
  stackBadge: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 2, color: colors.sepia, opacity: 0.8, marginBottom: 4, fontWeight: '700' },
  stackTitle: { fontFamily: fonts.uiMedium, fontSize: 13, color: colors.parchment, marginBottom: 4, lineHeight: 18 },
  stackDesc: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.fog, opacity: 0.7, lineHeight: 16 },
});
