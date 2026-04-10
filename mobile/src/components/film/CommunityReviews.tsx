import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';
import { ReelRating } from '@/src/components/Decorative';

export function CommunityReviews({ reviews }: { reviews: any[] }) {
    if (!reviews || reviews.length === 0) return null;

    return (
        <View style={s.container}>
            {reviews.map((review, i) => (
                <View key={review.id || i} style={s.reviewCard}>
                    <View style={s.reviewHeader}>
                        <View style={s.reviewAvatar}>
                            <Text style={s.reviewAvatarText}>
                                {review.username?.charAt(0)?.toUpperCase() || '?'}
                            </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.reviewUsername}>@{review.username}</Text>
                            <Text style={s.reviewDate}>
                                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                            </Text>
                        </View>
                        {review.rating > 0 && <ReelRating rating={review.rating} size={11} />}
                    </View>
                    {review.review ? (
                        <Text style={s.reviewText} numberOfLines={4}>"{review.review}"</Text>
                    ) : null}
                </View>
            ))}
        </View>
    );
}

const s = StyleSheet.create({
    container: { paddingHorizontal: 16, gap: 16 },
    reviewCard: { padding: 16, backgroundColor: colors.soot, borderRadius: 8, borderWidth: 1, borderColor: colors.ash },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.ash, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: colors.sepia },
    reviewAvatarText: { fontFamily: fonts.display, fontSize: 16, color: colors.fog },
    reviewUsername: { fontFamily: fonts.ui, fontSize: 12, letterSpacing: 1, color: colors.parchment },
    reviewDate: { fontFamily: fonts.ui, fontSize: 10, color: colors.fog, marginTop: 2 },
    reviewText: { fontFamily: fonts.body, fontSize: 14, color: colors.bone, fontStyle: 'italic', lineHeight: 22 }
});
