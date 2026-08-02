import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Stronger glass for selected / hero cards. */
  emphasized?: boolean;
  /** Confirm/delete overlays — slightly less translucent than emphasized. */
  modal?: boolean;
  /** Solid surface without web backdrop-filter (smooth modal animations). */
  solid?: boolean;
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

/** Resolve once — avoid re-require on every GlassPanel render. */
const NATIVE_GLASS = canUseNativeGlass();

/**
 * Cross-platform glass panel: real Liquid Glass on supported iOS,
 * translucent frosted surface everywhere else (incl. web backdrop-filter).
 */
export function GlassPanel({
  children,
  style,
  emphasized = false,
  modal = false,
  solid = false,
}: Props) {
  const hero = modal || emphasized;

  if (NATIVE_GLASS) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GlassView } = require('expo-glass-effect') as typeof import('expo-glass-effect');
    return (
      <GlassView
        style={[styles.base, style]}
        glassEffectStyle={hero ? 'clear' : 'regular'}
        tintColor={
          modal
            ? 'rgba(255,255,255,0.16)'
            : emphasized
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(255,255,255,0.08)'
        }
        isInteractive={hero}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.base,
        styles.fallback,
        modal && styles.fallbackModal,
        emphasized && !modal && styles.fallbackEmphasized,
        modal && !solid ? webBlurModal : emphasized ? webBlurEmphasized : webBlurStyle,
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

const webBlurEmphasized: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(40px) saturate(1.55)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.55)',
      } as ViewStyle)
    : null;

const webBlurModal: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(27px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(27px) saturate(1.4)',
      } as ViewStyle)
    : null;

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    // Helps web clip backdrop-filter to the rounded corners.
    ...(Platform.OS === 'web'
      ? ({
          isolation: 'isolate',
        } as ViewStyle)
      : null),
  },
  fallback: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  fallbackEmphasized: {
    backgroundColor: 'rgba(28, 24, 36, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#FF7A59',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
  fallbackModal: {
    backgroundColor: 'rgba(28, 24, 36, 0.60)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#FF7A59',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
  },
});
