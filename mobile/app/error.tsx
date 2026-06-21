import { logger } from '@/src/utils/logger';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ErrorBoundaryProps } from 'expo-router';
import { nav } from '@/src/utils/typedRouter';
import TactileEngine from '@/src/utils/TactileEngine';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { Sentry } from '@/src/lib/sentry';

export default function GlobalErrorScreen({ error, retry }: ErrorBoundaryProps) {


  useEffect(() => {
    // Report global JS thread crashes to Sentry
    if (__DEV__) {
      logger.error('[Global Error Boundary Caught]:', error);
    } else {
      Sentry.captureException(error);
    }
    TactileEngine.error();
  }, [error]);

  const handleRetry = () => {
    TactileEngine.selection();
    retry();
  };

  const handleGoHome = () => {
    TactileEngine.selection();
    nav.replace('/(tabs)');
  };

  return (
    <View style={s.container}>
      <View style={s.iconWrapper}>
        <AlertTriangle size={48} color={colors.danger} strokeWidth={1.5} />
      </View>
      
      <Text style={s.title}>The projection stalled.</Text>
      <Text style={s.subtitle}>
        A critical error disrupted the ReelHouse application. We have logged this incident in the archives for review.
      </Text>
      
      {__DEV__ && (
        <View style={s.devErrorContainer}>
          <Text style={s.devErrorText}>{error?.message || 'Unknown error'}</Text>
        </View>
      )}

      <View style={s.actions}>
        <Pressable 
          style={s.primaryBtn} 
          onPress={handleRetry} 
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading the screen"
        >
          <RotateCcw size={16} color={colors.ink} style={s.btnIcon} />
          <Text style={s.primaryBtnText}>RETRY</Text>
        </Pressable>

        <Pressable 
          style={s.secondaryBtn} 
          onPress={handleGoHome}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          accessibilityRole="button"
          accessibilityLabel="Return to the home screen"
        >
          <ArrowLeft size={16} color={colors.fog} style={s.btnIcon} />
          <Text style={s.secondaryBtnText}>RETURN HOME</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconWrapper: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(162, 36, 36, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(162, 36, 36, 0.3)',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.parchment,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.bone,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 24,
    marginBottom: 40,
    paddingHorizontal: 16,
  },
  devErrorContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 40,
    width: '100%',
  },
  devErrorText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.danger,
    lineHeight: 18,
  },
  actions: {
    width: '100%',
    gap: 16,
  },
  primaryBtn: {
    backgroundColor: colors.sepia,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 4,
    width: '100%',
  },
  primaryBtnText: {
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.ink,
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    width: '100%',
  },
  secondaryBtnText: {
    fontFamily: fonts.uiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.fog,
  },
  btnIcon: {
    marginRight: 8,
  },
});
