import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, layout, noTextCaret, pressableWeb, radius, shadowAccent, spacing } from '@/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

/**
 * Premium glass CTA used across intro/onboarding (and shared app chrome).
 * Primary = coral glass gradient; secondary/ghost = frosted dark glass.
 */
export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;
  const fadeDisabled = isDisabled && !isPrimary;
  const flatStyle = StyleSheet.flatten(style);
  const cornerRadius =
    typeof flatStyle?.borderRadius === 'number' ? flatStyle.borderRadius : radius.button;

  // IMPORTANT: the touch target is a plain <Pressable>, and the press-scale
  // animation lives on an inner <Animated.View>. Wrapping the Pressable itself
  // with reanimated (Animated.createAnimatedComponent(Pressable)) makes Android
  // drop/delay the first taps because the animated prop writes race the gesture
  // responder — that was the "takes a few clicks" bug.
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={10}
      pressRetentionOffset={{ top: 24, bottom: 24, left: 24, right: 24 }}
      android_ripple={{
        color: isPrimary ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)',
        borderless: false,
      }}
      onPressIn={() => {
        if (isDisabled) return;
        scale.value = withSpring(0.985, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 300 });
      }}
      style={[
        styles.pressable,
        isPrimary && !isDisabled && styles.primaryGlow,
        isDisabled && isPrimary && styles.primaryGlowDisabled,
        { borderRadius: cornerRadius },
        fadeDisabled && styles.disabled,
        style,
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.shell, { borderRadius: cornerRadius }, animatedStyle]}>
        {isPrimary ? (
          <LinearGradient
            colors={
              isDisabled
                ? [colors.accentDeep, '#8A3A2C']
                : [colors.accentLight, colors.accent, colors.accentDeep]
            }
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.base, styles.primaryInner, { borderRadius: cornerRadius }]}>
            <View pointerEvents="none" style={styles.sheen} />
            {loading ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text
                selectable={false}
                style={[
                  styles.label,
                  styles.labelPrimary,
                  isDisabled && styles.labelPrimaryDisabled,
                ]}>
                {title}
              </Text>
            )}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.base,
              styles.glassFace,
              variant === 'ghost' && styles.ghostFace,
              { borderRadius: cornerRadius },
              Platform.OS === 'web' ? webGlassBlur : null,
            ]}>
            <View pointerEvents="none" style={styles.sheenSoft} />
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text
                selectable={false}
                style={[
                  styles.label,
                  {
                    color: variant === 'ghost' ? colors.textSecondary : colors.text,
                  },
                ]}>
                {title}
              </Text>
            )}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const webGlassBlur: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(18px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.35)',
      } as ViewStyle)
    : null;

const styles = StyleSheet.create({
  pressable: {
    ...pressableWeb,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  primaryGlow: {
    ...shadowAccent,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.accent,
          shadowOpacity: 0.38,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 7 },
        }
      : null),
  },
  primaryGlowDisabled: {
    ...Platform.select({
      web: { boxShadow: 'none' } as object,
      ios: { shadowOpacity: 0, shadowRadius: 0 },
      default: { elevation: 0 },
    }),
  },
  disabled: { opacity: 0.45 },
  shell: {
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  base: {
    height: layout.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    overflow: 'hidden',
  },
  primaryInner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 249, 247, 0.22)',
  },
  glassFace: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  ghostFace: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  sheenSoft: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  label: {
    ...noTextCaret,
    fontSize: 14,
    fontFamily: fonts.displayMedium,
    letterSpacing: 0.3,
  },
  labelPrimary: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    letterSpacing: 0.25,
    color: colors.onAccent,
  },
  labelPrimaryDisabled: {
    color: 'rgba(255, 249, 247, 0.72)',
  },
});
