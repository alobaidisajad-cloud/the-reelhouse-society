import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { XCircle } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ReelRating } from '@/src/components/Decorative';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import { stripHtml } from '@/src/utils/html';
import { extractDropCap } from '@/src/utils/text';
import { getDisplayTier, isAuteurPlusTier, isArchivistPlusTier } from '@/src/utils/tier';
import SpoilerVeil from '@/src/components/SpoilerVeil';



interface CommunityReview {
  id: string;
  rating: number;
  review?: string | null;
  status: string;
  abandoned_reason?: string | null;
  created_at: string;
  user_id?: string | null;
  username?: string;
  role?: string;
  isLocal?: boolean;
  pull_quote?: string | null;
  drop_cap?: boolean | null;
  is_spoiler?: boolean | null;
}

interface FilmReviewsProps {
  filmId: number;
  filmTitle: string;
  reviews: CommunityReview[];
  reviewsError?: any;
  localReview?: CommunityReview | null;
}

export const FilmReviews = memo(function FilmReviews({ filmId, filmTitle, reviews, reviewsError, localReview }: FilmReviewsProps) {
  if (reviewsError) {
    throw reviewsError;
  }
  
  const nav = useRouter();

  const mergedReviews = React.useMemo(() => {
    if (!localReview) return reviews;
    const withoutLocal = reviews.filter(r => r.id !== localReview.id);
    return [{ ...localReview, isLocal: true }, ...withoutLocal];
  }, [reviews, localReview]);

  return (
    <SectionErrorBoundary fallbackMessage="Community critiques could not be loaded.">
      <Animated.View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>SOCIETY CRITIQUES</Text>
          <View style={s.sectionLine} />
        </View>
        
        {(() => {
          if (mergedReviews.length === 0) return (
            <View style={s.emptyReviewBox}>
              <Text style={s.emptyReviewTitle}>The projection box awaits.</Text>
              <Text style={s.emptyReviewBody}>No transmissions yet. Log this film to be the first voice in the archive.</Text>
            </View>
          );
          
          return mergedReviews.map((r, i) => {
            const tierLabel = r.isLocal ? 'YOUR REVIEW' : getDisplayTier(r.role);
            const strippedReview = stripHtml(r.review ?? '');
            const { first: dropCapFirst, rest: dropCapRest } = extractDropCap(strippedReview);
            
            const isAuteur = isAuteurPlusTier(r.role);
            const isArchivist = isArchivistPlusTier(r.role) && !isAuteur;

            return (
              <View key={r.id || i} style={[s.reviewCard, r.isLocal && s.reviewCardLocal]}>
                <Text style={s.reviewQuote}>&ldquo;</Text>
                <View style={s.reviewHeader}>
                  <View style={s.reviewAuthorWrap}>
                    <PressableScale onPress={() => !r.isLocal && r.username && nav.push(`/user/${encodeURIComponent(r.username)}`)} disabled={r.isLocal} pressedScale={0.97} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`View profile of ${r.username ?? 'anonymous'}`}>
                      <Text style={s.reviewAuthor} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>@{r.username ?? 'anonymous'}</Text>
                    </PressableScale>
                    <Text style={s.reviewTier} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tierLabel}</Text>
                  </View>
                  {r.status === 'abandoned' ? (
                    <View style={s.abandonedBadge}>
                      <XCircle size={8} color={colors.bloodReel} strokeWidth={2} />
                      <Text style={s.abandonedText}>
                        ABANDONED{r.abandoned_reason ? ` — ${r.abandoned_reason.toUpperCase()}` : ''}
                      </Text>
                    </View>
                  ) : r.rating > 0 ? (
                    <ReelRating rating={r.rating} size={12} />
                  ) : null}
                </View>
                <PressableScale onPress={() => { if (r.id && !r.isLocal && r.id !== 'local') nav.push(`/log/${r.id}`); }} disabled={r.isLocal || r.id === 'local'} pressedScale={0.99} accessibilityLabel={`Read full review by ${r.username ?? 'anonymous'}`}>
                  {/* COMP-SPOILER-1: veil flagged critiques; the author always sees their own. */}
                  <SpoilerVeil isSpoiler={r.is_spoiler} bypass={r.isLocal} revealKey={r.id}>
                    {r.pull_quote && (
                      <View style={[s.pullQuoteWrap, isAuteur && s.pullQuoteWrapAuteur, isArchivist && s.pullQuoteWrapPremium]}>
                        <Text style={[s.pullQuote, isAuteur && s.pullQuoteAuteur, isArchivist && s.pullQuotePremium]}>
                          « {r.pull_quote} »
                        </Text>
                      </View>
                    )}
                    {strippedReview ? (
                      r.drop_cap ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                          <Text style={s.dropCapLetter}>{dropCapFirst}</Text>
                          <Text style={[s.reviewText, { flex: 1, marginTop: 4 }]} numberOfLines={7} ellipsizeMode="tail">
                            {dropCapRest}
                          </Text>
                        </View>
                      ) : (
                        <Text style={s.reviewText} numberOfLines={7} ellipsizeMode="tail">
                          {strippedReview}
                        </Text>
                      )
                    ) : null}
                    {strippedReview.length > 250 && (
                      <Text style={s.yourLogReadMore}>READ FULL CRITIQUE →</Text>
                    )}
                  </SpoilerVeil>
                </PressableScale>
              </View>
            );
          });
        })()}

        {reviews.length >= 10 && (
          <PressableScale 
            onPress={() => nav.push(`/film-reviews/${filmId}?title=${encodeURIComponent(filmTitle || 'Archive')}`)}
            style={s.readAllBtn}
            pressedScale={0.97} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            accessibilityLabel="Read all reviews"
          >
            <Text style={s.readAllText}>READ ALL LOGS →</Text>
          </PressableScale>
        )}
      </Animated.View>
    </SectionErrorBoundary>
  );
});

const s = StyleSheet.create({
  section: { paddingHorizontal: 20, marginBottom: 24, zIndex: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  sectionTitle: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 3, color: colors.sepia },
  sectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(139,105,20,0.3)' },

  reviewCard: {
    backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 4, padding: 16, marginTop: 10,
    borderLeftWidth: 3, borderLeftColor: 'rgba(196,150,26,0.4)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
    position: 'relative', overflow: 'hidden',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  reviewQuote: {
    position: 'absolute', top: -4, left: 10, fontSize: 60,
    fontFamily: fonts.display, color: colors.sepia, opacity: 0.25,
  },
  reviewAuthorWrap: { flexShrink: 1, paddingRight: 8 },
  reviewAuthor: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1, color: colors.sepia },
  reviewTier: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 0.8, color: colors.fog, marginTop: 2 },
  reviewText: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.9 },
  reviewCardLocal: { borderLeftColor: colors.sepia, borderLeftWidth: 2 },
  
  pullQuoteWrap: { marginTop: 6, marginBottom: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: 'rgba(139,105,20,0.4)', paddingVertical: 2 },
  pullQuoteWrapAuteur: { borderLeftColor: colors.bloodReel, backgroundColor: 'rgba(125,31,31,0.05)', paddingVertical: 6, borderRadius: 2 },
  pullQuoteWrapPremium: { borderLeftColor: colors.sepia, backgroundColor: 'rgba(139,105,20,0.05)', paddingVertical: 6, borderRadius: 2 },
  pullQuote: { fontFamily: fonts.display, fontSize: 15, color: colors.sepia, lineHeight: 22 },
  pullQuoteAuteur: { color: colors.bloodReel },
  pullQuotePremium: { color: colors.sepia },
  dropCapLetter: { fontFamily: fonts.display, fontSize: 42, color: colors.sepia, marginRight: 6, marginTop: -4, lineHeight: 42 },

  yourLogReadMore: { fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.sepia, marginTop: 4 },

  emptyReviewBox: {
    padding: 24, borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    borderRadius: 2, alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.98)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 4,
  },
  emptyReviewTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 1, color: colors.sepia, marginBottom: 8 },
  emptyReviewBody: { fontFamily: fonts.body, fontSize: 12, color: colors.bone, fontStyle: 'italic', textAlign: 'center', lineHeight: 20, opacity: 0.5 },

  readAllBtn: {
    marginTop: 12, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(8,6,4,0.98)', borderRadius: 2,
    borderWidth: 1, borderColor: 'rgba(139,105,20,0.3)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8,
  },
  readAllText: { fontFamily: fonts.uiBold, fontSize: 9, letterSpacing: 3, color: colors.sepia },

  abandonedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(125,31,31,0.1)',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 2, borderWidth: 1, borderColor: 'rgba(125,31,31,0.3)',
  },
  abandonedText: {
    fontFamily: fonts.ui, fontSize: 8, letterSpacing: 1, color: colors.bloodReel,
  },
});
