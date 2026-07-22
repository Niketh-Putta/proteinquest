import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Stronger glass for selected / hero cards. */
  emphasized?: boolean;
}

function canUseNativeGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glass = require('expo-glass-effect') as typeof import('expo-glass-effect');
    return glass.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/**
 * Cross-platform glass panel: real Liquid Glass on supported iOS,
 * translucent frosted surface everywhere else (incl. web backdrop-filter).
 */
export function GlassPanel({ children, style, emphasized = false }: Props) {
  if (canUseNativeGlass()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GlassView } = require('expo-glass-effect') as typeof import('expo-glass-effect');
    return (
      <GlassView
        style={[styles.base, style]}
        glassEffectStyle="regular"
        tintColor={emphasized ? 'rgba(255,122,89,0.28)' : 'rgba(255,255,255,0.08)'}
        isInteractive={emphasized}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.base,
        styles.fallback,
        emphasized && styles.fallbackEmphasized,
        webBlurStyle,
        style,
      ]}>
      {children}
    </View>
  );
}

const webBlurStyle: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(22px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
      } as ViewStyle)
    : null;

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fallbackEmphasized: {
    backgroundColor: 'rgba(255,122,89,0.12)',
    borderColor: 'rgba(255,122,89,0.45)',
  },
});
