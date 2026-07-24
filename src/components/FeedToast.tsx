import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { GlassPanel } from '@/components/GlassPanel';
import { colors, fonts, layout, spacing } from '@/theme';

interface Props {
  visible: boolean;
  message: string;
  onHide?: () => void;
}

function parseFeedToast(message: string): { body: string; protein: string | null } {
  const parts = message.split(' · ').map((p) => p.trim()).filter(Boolean);
  const proteinIdx = parts.findIndex((p) => /^\+\d+g$/i.test(p));
  if (proteinIdx < 0) return { body: message, protein: null };
  const protein = parts[proteinIdx] ?? null;
  const body = parts.filter((_, i) => i !== proteinIdx).join(' · ');
  return { body, protein };
}

/** Brief post-scan dopamine toast on Today. */
export function FeedToast({ visible, message, onHide }: Props) {
  const insets = useSafeAreaInsets();
  const { body, protein } = parseFeedToast(message);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onHide?.(), 2800);
    return () => clearTimeout(t);
  }, [visible, onHide]);

  if (!visible || !message) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOutUp.duration(180)}
      style={[
        styles.wrap,
        {
          top: insets.top + spacing.sm + 4,
          paddingHorizontal: spacing.md,
          maxWidth: layout.sheetMaxWidth,
        },
      ]}>
      <GlassPanel emphasized style={styles.toast}>
        <View pointerEvents="none" style={styles.sheen} />
        <View style={styles.row}>
          <Ionicons name="sparkles" size={13} color="rgba(255, 176, 144, 0.9)" />
          <Text style={styles.text} numberOfLines={2}>
            {body}
            {protein ? <Text style={styles.protein}>{` · ${protein}`}</Text> : null}
          </Text>
        </View>
      </GlassPanel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 50,
    width: '100%',
  },
  toast: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow:
            '0 10px 28px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.14)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }),
  },
  sheen: {
    position: 'absolute',
    top: 1,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    opacity: 0.65,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1,
  },
  text: {
    flexShrink: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.text,
    textAlign: 'left',
  },
  protein: {
    fontFamily: fonts.displayHeavy,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.accentLight,
  },
});
