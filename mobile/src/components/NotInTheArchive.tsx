/**
 * NotInTheArchive — the page for a path that leads nowhere: a route the app does not have
 * (+not-found), or a route opened by a link whose id is of another shape (routeParams, P4.4).
 * A themed "not in the archive", with the way back to the Lobby.
 */
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { useRouter } from 'expo-router';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { ArrowLeft } from 'lucide-react-native';
import { RoomLight } from '@/src/components/atmosphere/RoomLight';
import Buster from '@/src/components/Buster';
import { CentredRoom } from '@/src/components/layout/CentredRoom';

export function NotInTheArchive() {
  const router = useRouter();

  return (
    <View style={s.container}>
      <RoomLight room="default" />
      <CentredRoom kind="pushed" style={s.room}>
        <Buster size={80} mood="suspicious" style={s.buster} />
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
      </CentredRoom>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  // Centred between the status bar and the home indicator by CentredRoom.
  room: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  buster: { marginBottom: 14 },
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
