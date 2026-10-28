import React, { useEffect, useState } from 'react';
import { useBackCloses } from '@/src/hooks/useBackCloses';
import { View, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { Text } from '@/src/components/text';
import { PresenceView } from '@/src/components/motion/Presence';
import { HouseBlur } from '@/src/components/HouseBlur';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import TactileEngine from '@/src/utils/TactileEngine';
import { Camera, Image as ImageIcon, X } from 'lucide-react-native';
import { logger } from '@/src/utils/logger';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts, effects } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';
import { scaledTextProps } from '@/src/constants/textScaling';
import { EDGE_LIT } from '@/src/theme/light';
import { arrive, leave, MS } from '@/src/theme/motion';
import { useSheetBottom } from '@/src/components/layout/navMetrics';

interface Props {
  onClose: () => void;
  onSuccess: (url: string) => void;
  /** A portrait picked while Android ended the app, prepared as the sheet opens. */
  pending?: string | null;
}

/**
 * A refused permission, said with the one way to grant it: once refused, the
 * phone never asks again, so the way is the system Settings.
 */
function askForSettings(what: string) {
  Alert.alert('Permission needed', `Allow ${what} in Settings to choose a portrait.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
  ]);
}

export default function AvatarCropSheet({ onClose, onSuccess, pending }: Props) {
  const { user } = useAuthStore();
  const [uploading, setUploading] = useState(!!pending);
  const sheetFoot = useSheetBottom();
  // Android's back closes the sheet, not Edit Profile beneath it.
  useBackCloses(true, onClose);

  const handlePick = async (source: 'camera' | 'library') => {
    TactileEngine.selection();

    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return askForSettings('camera access');
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    } else {
      // The system's picker (PHPicker, Android's photo picker) hands back only the photo chosen
      // and needs no permission: asking first let a refusal block a portrait for nothing.
      result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    }

    if (!result.canceled && result.assets[0]?.uri && user) {
      await processAndUpload(result.assets[0].uri);
    }
  };

  // Re-encode every chosen image before it leaves the device. This strips all
  // embedded metadata (EXIF — including GPS coordinates the photo may carry),
  // normalizes the output to a square 512px JPEG, and bounds the upload size.
  const prepare = async (uri: string) => {
    try {
      const rendered = await ImageManipulator.manipulate(uri).resize({ width: 512 }).renderAsync();
      const out = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error('Could not process the selected image.');
      TactileEngine.success();
      onSuccess(out.base64);
    } catch (err: unknown) {
      logger.warn('[AvatarCropSheet] the photo could not be prepared:', err);
      reelToast.error('That photo could not be prepared. Try another.');
      TactileEngine.error();
    }
  };
  const processAndUpload = async (uri: string) => {
    setUploading(true);
    await prepare(uri);
    setUploading(false);
  };

  // The portrait the system kept for us: prepared once, as the sheet opens.
  useEffect(() => {
    if (!pending) return;
    void prepare(pending).then(() => setUploading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <HouseBlur intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <PresenceView name="avatar-crop" style={[s.sheet, { paddingBottom: sheetFoot }]}
        enter={{ kind: 'FadeInUp', duration: MS.considered, easing: arrive() }}
        exit={{ kind: 'FadeOutDown', duration: MS.quick, easing: leave() }}>
        <View style={s.header}>
          <Text {...scaledTextProps} style={s.title}>UPDATE IDENTITY</Text>
          <PressableScale onPress={() => { onClose(); }} style={s.closeBtn} hitSlop={{ top: 15, bottom: 9, left: 15, right: 15 }} haptic="selection" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} />
          </PressableScale>
        </View>

        {uploading ? (
          <View style={s.uploading}>
            <ActivityIndicator size="large" color={colors.sepia} />
            <Text {...scaledTextProps} style={s.uploadText}>Developing in Darkroom...</Text>
          </View>
        ) : (
          <View style={s.actions}>
            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} style={s.actionCard} onPress={() => handlePick('camera')} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Use camera: take a photo">
              <View style={s.iconWrap}>
                <Camera size={24} color={colors.sepia} />
              </View>
              <Text {...scaledTextProps} style={s.actionText}>USE CAMERA</Text>
            </PressableScale>

            <PressableScale hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} style={s.actionCard} onPress={() => handlePick('library')} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Choose a photo from your library">
              <View style={s.iconWrap}>
                <ImageIcon size={24} color={colors.bone} />
              </View>
              <Text {...scaledTextProps} style={s.actionText}>PHOTO LIBRARY</Text>
            </PressableScale>
          </View>
        )}
      </PresenceView>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { ...EDGE_LIT,
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.soot, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 20, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.2)',
    ...effects.flat,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, letterSpacing: 1 },
  closeBtn: { padding: 4 },
  actions: { flexDirection: 'row', gap: 16 },
  actionCard: {
    flex: 1, backgroundColor: colors.ink, borderRadius: 8, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: colors.ash,
  },
  iconWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(184,137,26,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.bone },
  uploading: { alignItems: 'center', paddingVertical: 40 },
  uploadText: { fontFamily: fonts.bodyItalic, fontSize: 14, color: colors.sepia, marginTop: 16 },
});
