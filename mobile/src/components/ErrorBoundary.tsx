/**
 * ErrorBoundary — Crash Shield for ReelHouse Native.
 * 
 * Catches unhandled render errors and displays a Nitrate Noir styled
 * fallback instead of a white screen. Logs the error for diagnostics.
 * 
 * Usage: Wrap the root <Stack /> in _layout.tsx
 */
import React, { Component, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts } from '../theme/theme';
import { captureError } from '../lib/sentry';
import PressableScale from './PressableScale';
import { router } from 'expo-router';

interface Props {
  children: ReactNode;
  /** Optional fallback UI — if not provided, uses default Nitrate Noir screen */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorId: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) {
      console.error(`[ErrorBoundary] [${this.state.errorId}] Caught render error:`, error, errorInfo.componentStack);
    } else {
      // M-07 AUDIT FIX: Use static import instead of dynamic require()
      captureError(error, {
        errorId: this.state.errorId,
        componentStack: errorInfo.componentStack?.slice(0, 200),
        retryCount: this.state.retryCount,
      });
    }
  }

  handleRetry = () => {
    if (this.state.retryCount >= MAX_RETRIES) {
      // Max retries reached — don't allow infinite loops
      return;
    }
    // #10 AUDIT FIX: Clear potentially corrupt cached data before retry
    try {
      const { queryClient } = require('../lib/queryClient');
      queryClient.clear();
    } catch {
      // queryClient may not be available — proceed with retry anyway
    }
    // E-01 AUDIT FIX: Reset navigation to known-good state.
    // If the router context itself is corrupt (e.g., the error was in the
    // navigation tree), this will throw — but we still reset the boundary
    // state so the component tree can attempt a clean re-mount.
    try {
      router.replace('/(tabs)');
    } catch {
      // Router context may be corrupt — the state reset below will
      // still allow the component tree to re-mount cleanly.
      if (__DEV__) console.warn('[ErrorBoundary] Router reset failed — falling back to tree re-mount');
    }
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const retriesExhausted = this.state.retryCount >= MAX_RETRIES;

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.glyph}>⊗</Text>
            <Text style={styles.title}>PROJECTION FAILURE</Text>
            <Text style={styles.subtitle}>
              Something went wrong in the screening room.
            </Text>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorBox} contentContainerStyle={styles.errorBoxContent}>
                <Text style={styles.errorText}>
                  {this.state.error.message}
                </Text>
              </ScrollView>
            )}

            {this.state.errorId && (
              <Text style={styles.errorIdText}>
                REF: {this.state.errorId}
              </Text>
            )}

            <PressableScale
              style={[styles.retryButton, retriesExhausted && styles.retryButtonDisabled]}
              onPress={this.handleRetry}
              disabled={retriesExhausted}
              pressedScale={0.97}
              accessibilityRole="button"
              accessibilityLabel="Retry loading the screen"
            >
              <Text style={styles.retryText}>
                {retriesExhausted ? '◆ PLEASE RESTART APP' : `◆ RETRY SCREENING (${MAX_RETRIES - this.state.retryCount} left)`}
              </Text>
            </PressableScale>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  glyph: {
    fontSize: 48,
    color: colors.bloodReel,
    marginBottom: 16,
    fontFamily: fonts.display,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.sub,
    color: colors.parchment,
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.body,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorBox: {
    maxHeight: 120,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    marginBottom: 24,
  },
  errorBoxContent: {
    padding: 12,
  },
  errorText: {
    fontSize: 11,
    fontFamily: fonts.body,
    color: colors.bloodReel,
    lineHeight: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderWidth: 1,
    borderColor: colors.bloodReel,
    borderRadius: 4,
  },
  retryText: {
    fontSize: 13,
    fontFamily: fonts.sub,
    color: colors.parchment,
    letterSpacing: 2,
    textAlign: 'center',
  },
  errorIdText: {
    fontSize: 9,
    fontFamily: fonts.body,
    color: colors.fog,
    letterSpacing: 1,
    marginBottom: 16,
    opacity: 0.5,
  },
  retryButtonDisabled: {
    opacity: 0.4,
    borderColor: colors.fog,
  },
});
