import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { isAnonymous, userEmail } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { colors, fonts, radius, spacing, type } from '@/theme';

export function AccountCard() {
  const { session, signInWithGoogle, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = userEmail(session);
  const guest = isAnonymous(session);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e.message ?? 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>ACCOUNT</Text>
      {guest ? (
        <Text style={styles.status}>Signed in as guest — data stays on this device until you link Google.</Text>
      ) : (
        <View style={styles.signedRow}>
          <Ionicons name="logo-google" size={16} color={colors.accent} />
          <Text style={styles.email}>{email}</Text>
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {guest ? (
        <Pressable
          onPress={handleGoogle}
          disabled={busy}
          style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.85 }]}>
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.onAccent} />
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
          )}
        </Pressable>
      ) : (
        <Pressable onPress={() => signOut().catch(() => {})} style={styles.linkBtn}>
          <Text style={styles.linkText}>Switch account</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  label: { ...type.label },
  status: { ...type.body, fontSize: 13 },
  signedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  email: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.text },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 48,
    marginTop: 4,
  },
  googleText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAccent },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  linkText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
});
