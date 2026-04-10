import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Sparkles, Film, ArrowRight } from 'lucide-react-native';

import { colors, fonts } from '@/src/theme/theme';
import { tmdb } from '@/src/lib/tmdb';

const blurhash = 'L87n_O~q00_300E1t7Rj00%#RjV@';

export default function OracleScreen() {
  const router = useRouter();
  const [mood, setMood] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const askOracle = async () => {
    if (!mood.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setRecommendations([]);

    try {
      // In a real env, this hits a custom Supabase edge function or OpenAI API.
      // For this native parity showcase without exposing heavy API keys on client:
      // We will perform a keyword TMDB search based on the mood.
      const searchRes = await tmdb.search(mood);
      const movies = (searchRes?.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === undefined) // TMDB search endpoints sometime omit media_type for keyword endpoints
        .slice(0, 5);
      
      setTimeout(() => {
        setRecommendations(movies);
        setLoading(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 1500); // Simulate Oracle "thinking" for dramatic effect
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.container}>
      <LinearGradient 
        colors={['#1a1510', colors.ink]} 
        locations={[0, 0.4]}
        style={StyleSheet.absoluteFillObject} 
      />
      
      <View style={s.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color={colors.bone} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={s.scrollContent} 
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(800).springify()} style={s.header}>
          <View style={s.iconWrap}>
            <Sparkles size={24} color={colors.sepia} />
          </View>
          <Text style={s.eyebrow}>THE ORACLE</Text>
          <Text style={s.title}>Consult the Archives</Text>
          <Text style={s.subtitle}>
            Describe the exact feeling, genre, or aesthetic you desire. The Oracle will parse the vault to find your perfect cinema.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(800).delay(200).springify()} style={s.inputSection}>
          <TextInput
            style={s.input}
            placeholder="E.g. A melancholic neon-soaked thriller in Tokyo..."
            placeholderTextColor={colors.fog}
            value={mood}
            onChangeText={setMood}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity 
            style={[s.submitBtn, (!mood.trim() || loading) && s.submitBtnDisabled]} 
            onPress={askOracle}
            disabled={!mood.trim() || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.ink} size="small" />
            ) : (
              <Text style={s.submitText}>DIVINE</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {loading && (
          <Animated.View entering={FadeInUp} style={s.loadingState}>
             <Text style={s.loadingText}>The Oracle is sifting through 100 years of cinema...</Text>
          </Animated.View>
        )}

        {recommendations.length > 0 && (
          <Animated.View entering={FadeInUp.duration(600).springify()} style={s.resultsSection} layout={Layout.springify()}>
            <Text style={s.resultsHeader}>THE ORACLE PROPOSES:</Text>
            {recommendations.map((item, index) => {
              const posterUri = item.poster_path ? tmdb.poster(item.poster_path, 'w342') : null;
              return (
                <Animated.View key={item.id} entering={FadeInUp.delay(index * 150)}>
                  <TouchableOpacity 
                    style={s.resultCard}
                    onPress={() => router.push(`/film/${item.id}`)}
                    activeOpacity={0.8}
                  >
                    {posterUri ? (
                      <Image source={{ uri: posterUri }} style={s.poster} contentFit="cover" placeholder={blurhash} transition={300} />
                    ) : (
                      <View style={[s.poster, s.noPoster]}>
                        <Film size={24} color={colors.fog} />
                      </View>
                    )}
                    <View style={s.resultInfo}>
                      <Text style={s.resultTitle} numberOfLines={2}>{item.title}</Text>
                      <Text style={s.resultYear}>{item.release_date?.substring(0,4) || 'Unknown'}</Text>
                      <Text style={s.resultDesc} numberOfLines={3}>{item.overview}</Text>
                    </View>
                    <ArrowRight size={16} color={colors.sepia} style={{ marginRight: 16 }} />
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ink },
  navBar: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingHorizontal: 16, paddingBottom: 16, zIndex: 10,
  },
  backBtn: { padding: 8, marginLeft: -8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  
  header: { alignItems: 'center', marginTop: 20, marginBottom: 30 },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(139,105,20,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
  },
  eyebrow: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 4, color: colors.sepia, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.parchment, marginBottom: 16, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.fog, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  
  inputSection: { marginBottom: 30 },
  input: {
    backgroundColor: 'rgba(10, 7, 3, 0.6)',
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.4)',
    borderRadius: 2, padding: 16, height: 120,
    fontFamily: fonts.body, fontSize: 15, color: colors.bone,
    shadowColor: colors.sepia, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  submitBtn: {
    backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 16,
    alignItems: 'center', marginTop: 16,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontFamily: fonts.uiBold, fontSize: 13, letterSpacing: 3, color: colors.ink },
  
  loadingState: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia, fontStyle: 'italic', marginTop: 16 },
  
  resultsSection: { marginTop: 10 },
  resultsHeader: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.fog, marginBottom: 16, marginLeft: 4 },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.soot,
    borderRadius: 2, marginBottom: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  poster: { width: 80, height: 120, backgroundColor: colors.ash },
  noPoster: { alignItems: 'center', justifyContent: 'center', opacity: 0.2 },
  resultInfo: { flex: 1, padding: 16 },
  resultTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.parchment, marginBottom: 4 },
  resultYear: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia, marginBottom: 8 },
  resultDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.fog, lineHeight: 18 },
});
