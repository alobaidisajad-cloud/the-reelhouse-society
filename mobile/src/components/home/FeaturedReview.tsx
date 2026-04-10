import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';

const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500';
const AnimatedView = Animated.createAnimatedComponent(View);

export function FeaturedReview() {
  const router = useRouter();
  const [featured, setFeatured] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: hotLogs } = await supabase
          .from('logs')
          .select('id, film_id, film_title, poster_path, rating, review, created_at, user_id, profiles!logs_user_id_fkey(username, role)')
          .not('review', 'is', null)
          .neq('review', '')
          .gt('rating', 0)
          .gte('created_at', twentyFourHoursAgo)
          .order('created_at', { ascending: false })
          .limit(1); 
        if (hotLogs && hotLogs.length > 0) {
          setFeatured(hotLogs[0]);
        } else {
          const { data: fallback } = await supabase
            .from('logs')
            .select('id, film_id, film_title, poster_path, rating, review, created_at, profiles!logs_user_id_fkey(username, role)')
            .not('review', 'is', null)
            .neq('review', '')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (fallback) setFeatured(fallback);
        }
      } catch {}
    })();
  }, []);

  if (!featured) return null;

  const posterUri = featured.poster_path ? `${TMDB_IMG_W500}${featured.poster_path}` : null;
  const username = Array.isArray(featured.profiles) ? featured.profiles[0]?.username : featured.profiles?.username || 'SOCIETY';
  const role = Array.isArray(featured.profiles) ? featured.profiles[0]?.role : featured.profiles?.role;

  return (
    <AnimatedView entering={FadeInDown.duration(800)}>
      <View style={s.featuredContainer}>
        <Text style={s.featuredEyebrow}>✦ HOTTEST DISPATCH ✦</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/log/${featured.id}`)}
          style={[s.featuredCard, role === 'auteur' && s.featuredAuteur, role === 'archivist' && s.featuredArchivist]}
        >
          <View style={s.featuredQuoteWrap}>
            <Text style={s.featuredQuoteIcon}>"</Text>
          </View>
          <View style={s.featuredContent}>
            {posterUri && (
              <Image source={{ uri: posterUri }} style={s.featuredPoster} />
            )}
            <View style={s.featuredTextWrap}>
               <Text style={s.featuredReview} numberOfLines={5}>"{featured.review}"</Text>
               <View style={s.featuredMetaRow}>
                 <Text style={s.featuredAuthor}>@{username}</Text>
                 <ReelRating rating={featured.rating} size={11} />
               </View>
            </View>
          </View>
          
          <TouchableOpacity 
            style={s.featuredBtn}
            onPress={() => router.push(`/film/${featured.film_id}`)}
          >
             <Text style={s.featuredBtnText}>LOG THIS FILM +</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    </AnimatedView>
  );
}

const s = StyleSheet.create({
  featuredContainer: { paddingHorizontal: 16, marginTop: 16, marginBottom: 24, alignItems: 'center' },
  featuredEyebrow: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 12 },
  featuredCard: {
    backgroundColor: 'rgba(18,14,9,0.95)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.15)',
    borderRadius: 8,
    borderLeftWidth: 3, borderLeftColor: colors.sepia,
    padding: 20, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 25,
  },
  featuredArchivist: { borderLeftColor: colors.sepia },
  featuredAuteur: { borderLeftColor: colors.bloodReel },
  featuredQuoteWrap: { position: 'absolute', top: 10, left: 10 },
  featuredQuoteIcon: { fontFamily: fonts.display, fontSize: 60, color: colors.sepia, opacity: 0.1, lineHeight: 60 },
  featuredContent: { flexDirection: 'row', gap: 16, marginTop: 10 },
  featuredPoster: { width: 70, height: 105, borderRadius: 2, borderWidth: 1, borderColor: 'rgba(139,105,20,0.1)' },
  featuredTextWrap: { flex: 1 },
  featuredReview: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.parchment, lineHeight: 22, textShadowColor: '#000', textShadowOffset: {width:0, height:1}, textShadowRadius: 2 },
  featuredMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.2)' },
  featuredAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.bone },
  featuredBtn: { marginTop: 20, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.2)', paddingTop: 16, alignItems: 'center' },
  featuredBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 3, color: colors.fog },
});
