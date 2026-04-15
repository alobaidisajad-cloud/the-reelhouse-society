/**
 * ErrorBoundary — Crash Shield for ReelHouse Native.
 * 
 * Catches unhandled render errors and displays a Nitrate Noir styled
 * fallback instead of a white screen. Logs the error for diagnostics.
 * 
 * Usage: Wrap the root <Stack /> in _layout.tsx
 */
import React, { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, fonts } from '../theme/theme';

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
    // Log for diagnostics — in production, send to crash reporting
    if (__DEV__) {
      console.error(`[ErrorBoundary] [${this.state.errorId}] Caught render error:`, error, errorInfo.componentStack);
    } else {
      // Production: structured crash log (ready for Sentry/Crashlytics integration)
      console.error(JSON.stringify({
        errorId: this.state.errorId,
        message: error.message,
        stack: error.stack?.slice(0, 500),
        component: errorInfo.componentStack?.slice(0, 200),
        timestamp: new Date().toISOString(),
        retryCount: this.state.retryCount,
      }));
    }
  }

  handleRetry = () => {
    if (this.state.retryCount >= MAX_RETRIES) {
      // Max retries reached — don't allow infinite loops
      return;
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

            <TouchableOpacity
              style={[styles.retryButton, retriesExhausted && styles.retryButtonDisabled]}
              onPress={this.handleRetry}
              activeOpacity={0.7}
              disabled={retriesExhausted}
            >
              <Text style={styles.retryText}>
                {retriesExhausted ? '◆ PLEASE RESTART APP' : `◆ RETRY SCREENING (${MAX_RETRIES - this.state.retryCount} left)`}
              </Text>
            </TouchableOpacity>
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
    fontFamily: fonts.accent,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.heading,
    color: colors.cream,
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
    fontFamily: fonts.mono,
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
    fontFamily: fonts.heading,
    color: colors.cream,
    letterSpacing: 2,
    textAlign: 'center',
  },
  errorIdText: {
    fontSize: 9,
    fontFamily: fonts.mono,
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
