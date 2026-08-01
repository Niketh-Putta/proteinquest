import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, pressableWeb, spacing } from '@/theme';

/** Recovery screen for unmatched routes / bad deep links. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found', headerShown: false }} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <Ionicons name="compass-outline" size={36} color={colors.textTertiary} />
          <Text style={styles.title}>Page not found</Text>
          <Text style={styles.body}>That link does not match a screen in ProteinQuest.</Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/today')}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }, pressableWeb]}
            accessibilityRole="button"
            accessibilityLabel="Go to Today">
            <Text style={styles.ctaText}>Go to Today</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    marginTop: spacing.md,
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  cta: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  ctaText: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    color: colors.onAccent,
  },
});
