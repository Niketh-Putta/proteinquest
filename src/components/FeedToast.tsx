import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { colors, fonts, spacing } from '@/theme';

interface Props {
  visible: boolean;
  message: string;
  onHide?: () => void;
}

/** Brief post-scan dopamine toast on Today. */
export function FeedToast({ visible, message, onHide }: Props) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onHide?.(), 2800);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible || !message) return null;

  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} style={styles.toast}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: spacing.xl,
    alignSelf: 'center',
    zIndex: 50,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    maxWidth: '88%',
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  text: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 0.3,
    color: colors.onAccent,
    textAlign: 'center',
  },
});
