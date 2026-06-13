import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, noTextCaret, pressableWeb, radius, spacing } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || loading}
      // Forgiving touch target: keep the press alive even if the finger drifts
      // slightly (otherwise a ScrollView steals the gesture and the tap is
      // dropped, which makes the button feel unresponsive on Android).
      hitSlop={10}
      pressRetentionOffset={{ top: 24, bottom: 24, left: 24, right: 24 }}
      android_ripple={{
        color: isPrimary ? 'rgba(0,0,0,0.16)' : colors.hairlineBright,
        borderless: false,
      }}
      onPressIn={() => (scale.value = withSpring(0.98, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      style={[
        styles.base,
        isPrimary && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && { opacity: 0.4 },
        animatedStyle,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} />
      ) : (
        <Text
          selectable={false}
          style={[
            styles.label,
            { color: isPrimary ? colors.onAccent : variant === 'ghost' ? colors.textSecondary : colors.text },
          ]}>
          {title}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    ...pressableWeb,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
  },
  primary: { backgroundColor: colors.accent },
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
