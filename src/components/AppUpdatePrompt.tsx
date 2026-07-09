import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Button } from '@/components/Button';
import {
  checkForAppUpdate,
  openAppStoreListing,
  type UpdatePromptDecision,
} from '@/lib/app-update';
import { colors, fonts, pressableWeb, radius, spacing } from '@/theme';

/** Soft/force store update modal; no-ops on web. Mount once at app root. */
export function AppUpdatePrompt() {
  const [decision, setDecision] = useState<UpdatePromptDecision | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    checkForAppUpdate()
      .then((result) => {
        if (!cancelled && result && result.kind !== 'none') setDecision(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const visible = !!decision && decision.kind !== 'none' && !(decision.kind === 'soft' && dismissed);
  const force = decision?.kind === 'force';

  async function onUpdate() {
    if (!decision) return;
    await openAppStoreListing(decision.storeUrl);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!force) setDismissed(true);
      }}>
      <View style={styles.root}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop} />
        <Animated.View entering={FadeInUp.duration(240)} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="arrow-up-circle" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>Update the app</Text>
          <Text style={styles.body}>{decision?.message}</Text>
          {decision?.latestVersion ? (
            <Text style={styles.meta}>
              Latest {decision.latestVersion}
              {decision.currentVersion ? ` · You have ${decision.currentVersion}` : ''}
            </Text>
          ) : null}
          <Button title="Update" onPress={onUpdate} style={styles.primary} />
          {!force ? (
            <Pressable
              onPress={() => setDismissed(true)}
              hitSlop={10}
              style={({ pressed }) => [styles.later, pressed && styles.laterPressed]}>
              <Text style={styles.laterLabel}>Later</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 6, 9, 0.78)',
  },
  card: {
    ...pressableWeb,
    backgroundColor: colors.bgRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.4,
    color: colors.textTertiary,
    marginBottom: spacing.lg,
  },
  primary: {
    marginBottom: spacing.sm,
  },
  later: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  laterPressed: {
    opacity: 0.7,
  },
  laterLabel: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.textSecondary,
  },
});
