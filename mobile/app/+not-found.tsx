/**
 * +not-found.tsx — Deep Link Catch-All
 * ─────────────────────────────────────
 * Handles malformed deep links (reelhouse://...)
 * and unmatched routes to prevent blank screens.
 * 
 * Displays a themed "Not in the Archive" screen with a
 * return-home action.
 */
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ArrowLeft } from 'lucide-react-native';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={s.container}>
      <Text style={s.glyph}>∅</Text>
      <Text style={s.title}>ROUTE NOT IN THE ARCHIVE</Text>
      <Text style={s.body}>
        This path could not be resolved. It may have been withdrawn or the link is malformed.
      </Text>
      <PressableScale
        style={s.backBtn}
        onPress={() => (router.replace as any)('/(tabs)')}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel="Return to lobby"
      >
        <View style={s.backRow}>
          <ArrowLeft size={12} color={colors.bone} strokeWidth={1.5} />
          <Text style={s.backText}>RETURN TO LOBBY</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  glyph: {
    fontSize: 48,
    color: colors.bloodReel,
    marginBottom: 16,
    fontFamily: fonts.display,
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.sub,
    color: colors.parchment,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    maxWidth: 280,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: colors.sepia,
    borderRadius: 4,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 10,
    fontFamily: fonts.sub,
    color: colors.bone,
    letterSpacing: 2,
  },
});
