/**
 * SectionErrorBoundary — Tab-Level Crash Shield with Retry
 * ────────────────────────────────────────────────────────
 * Upgraded from static error display to recoverable
 * boundary with 2 retry attempts. When a tab section crashes, users
 * can tap "RETRY" to clear stale query cache and re-mount the component
 * tree — without losing their position in other tabs.
 *
 * GOLDEN RULE: Zero visual changes to working screens. This component
 * only renders when a crash actually occurs.
 */
import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { logger } from '@/src/utils/logger';
import { captureError } from '@/src/lib/sentry';
import { queryClient } from '@/src/lib/queryClient';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  /** Label for Sentry context (e.g. 'reels', 'ledger', 'dispatch') */
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

const MAX_SECTION_RETRIES = 2;

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const section = this.props.section ?? 'unknown';
    
    if (__DEV__) {
      logger.error(`[SectionErrorBoundary:${section}] Render crash:`, error);
    } else {
      captureError(error, {
        boundary: 'section',
        section,
        componentStack: errorInfo.componentStack?.slice(0, 300),
        retryCount: this.state.retryCount,
      });
    }
  }

  handleRetry = () => {
    // Clear potentially corrupt cached data before retry
    try {
      queryClient.removeQueries({ type: 'inactive' });
    } catch {
      // Non-critical — proceed with retry anyway
    }

    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const retriesExhausted = this.state.retryCount >= MAX_SECTION_RETRIES;

      return (
        <View style={styles.container}>
          <AlertTriangle size={24} color={colors.bloodReel} strokeWidth={1.5} />
          <Text style={styles.text}>
            {retriesExhausted
              ? 'This section could not recover. Try restarting the app.'
              : this.props.fallbackMessage || 'This section encountered an error.'}
          </Text>
          {!retriesExhausted && (
            <Pressable
              style={styles.retryButton}
              onPress={this.handleRetry}
              accessibilityRole="button"
              accessibilityLabel={`Retry loading the ${this.props.section ?? 'section'}`}
            >
              <Text style={styles.retryText}>
                ◆ RETRY ({MAX_SECTION_RETRIES - this.state.retryCount} left)
              </Text>
            </Pressable>
          )}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    // Removed flex:1 — SectionErrorBoundary wraps individual
    // sections, not full screens. flex:1 consumed all parent height and pushed
    // sibling sections off-screen.
    backgroundColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 24,
    gap: 10,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.fog,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: colors.bloodReel,
    borderRadius: 4,
  },
  retryText: {
    fontSize: 12,
    fontFamily: fonts.sub,
    color: colors.parchment,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
});
