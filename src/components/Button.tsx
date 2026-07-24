import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, noTextCaret, pressableWeb, radius, spacing } from '@/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;
  // Primary uses a muted fill instead of opacity so labels stay readable.
  const fadeDisabled = isDisabled && !isPrimary;

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
        color: isPrimary ? 'rgba(0,0,0,0.16)' : colors.hairlineBright,
        borderless: false,
      }}
      onPressIn={() => {
        if (isDisabled) return;
        scale.value = withSpring(0.98, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 300 });
      }}
      style={[styles.pressable, fadeDisabled && styles.disabled, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.base,
          isPrimary && styles.primary,
          isPrimary && isDisabled && styles.primaryDisabled,
          variant === 'secondary' && styles.secondary,
          variant === 'ghost' && styles.ghost,
          animatedStyle,
        ]}>
        {loading ? (
          <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
        ) : (
          <Text
            selectable={false}
            style={[
              styles.label,
              {
                color: isPrimary
                  ? isDisabled
                    ? 'rgba(255, 249, 247, 0.72)'
                    : colors.onAccent
                  : variant === 'ghost'
                    ? colors.textSecondary
                    : colors.text,
              },
            ]}>
            {title}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    ...pressableWeb,
    borderRadius: radius.button,
    // Clip the Android ripple to the rounded shape.
    overflow: 'hidden',
  },
  disabled: { opacity: 0.4 },
  base: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
  },
  primary: { backgroundColor: colors.accent },
  primaryDisabled: {
    backgroundColor: colors.accentDeep,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  ghost: { backgroundColor: 'transparent' },
  label: {
    ...noTextCaret,
    fontSize: 14,
    fontFamily: fonts.displayMedium,
    letterSpacing: 0.3,
  },
});
