import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadAvatar } from '@/lib/api';
import { DragonEvolutionGallery } from '@/components/DragonEvolutionGallery';
import { GoalEditor } from '@/components/GoalEditor';
import { dragonById, displayDragonId, isDailyDragonLockedForToday } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { setPreferredName } from '@/lib/xp';
import { colors, fonts, noTextCaret, spacing } from '@/theme';

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

export default function SettingsScreen() {
  const { profile, session, saveProfile } = useSession();
  const { contentMaxWidth, horizontalPad, isNarrow } = useLayout();
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (profile?.display_name) setLeagueName(profile.display_name);
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile?.display_name, profile?.avatar_url]);

  async function commitName() {
    const next = leagueName.trim().slice(0, 24);
    setPreferredName(next).catch(() => {});
    if (next && next !== (profile?.display_name ?? '')) {
      try {
        await saveProfile({ display_name: next });
      } catch {
        /* name is cosmetic; ignore transient save errors */
      }
    }
  }

  async function changePhoto() {
    if (uploadingAvatar) return;
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo library access is needed to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets[0]) return;

      const userId = session?.user.id;
      if (!userId) {
        setError('Sign in to save a profile picture.');
        return;
      }

      setUploadingAvatar(true);
      const ctx = ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 512 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!saved.base64) throw new Error('Could not read that image. Try a JPEG or PNG.');

      const url = await uploadAvatar(userId, saved.base64);
      if (!url) throw new Error('Upload failed. Please try again.');

      setAvatarUrl(url);
      await saveProfile({ avatar_url: url });
    } catch (e: any) {
      setError(e?.message ?? 'Could not update your photo. Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  const photoInitial = (leagueName.trim() || profile?.display_name || 'You').slice(0, 1).toUpperCase();

  async function handleSubmit(updates: Partial<Profile>) {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(updates);
      setSavedFlash(true);
      setTimeout(goHome, 700);
    } catch (e: any) {
      setError(e.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={goHome} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>SETTINGS</Text>
        <View style={{ width: 44 }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Text style={[styles.title, isNarrow && styles.titleNarrow]}>Preferences</Text>
          <Text style={styles.subtitle}>
            Adjust your stats and the target recalculates with full reasoning.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PROFILE PHOTO</Text>
            <View style={styles.photoRow}>
              <Pressable
                onPress={changePhoto}
                disabled={uploadingAvatar}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture"
                style={styles.photoTap}>
                <View style={styles.photoCircle}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.photoImage} contentFit="cover" />
                  ) : (
                    <Text style={styles.photoInitial}>{photoInitial}</Text>
                  )}
                  {uploadingAvatar ? (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator color={colors.text} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.photoBadge}>
                  <Ionicons name="camera" size={13} color={colors.text} />
                </View>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.photoTitle}>
                  {avatarUrl ? 'Looking sharp.' : 'Add a profile picture'}
                </Text>
                <Text style={styles.photoHint}>
                  Shown on the leaderboard. Tap the circle to {avatarUrl ? 'change' : 'upload'}.
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LEAGUE NAME</Text>
            <TextInput
              value={leagueName}
              onChangeText={setLeagueName}
              onBlur={commitName}
              onSubmitEditing={commitName}
              returnKeyType="done"
              placeholder="How you appear on the board"
              placeholderTextColor={colors.textTertiary}
              maxLength={24}
              autoCapitalize="words"
              autoCorrect={false}
              style={[styles.nameInput, noTextCaret]}
            />
            <Pressable onPress={() => router.push('/league')} style={styles.leagueLink}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leagueLinkTitle}>Protein League</Text>
                <Text style={styles.leagueLinkHint}>See your rank and who&apos;s ahead</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {profile && isDailyDragonLockedForToday(profile, todayISODate()) ? (
            <View style={styles.lockedDragon}>
              <Text style={styles.lockedLabel}>TODAY&apos;S DRAGON</Text>
              <Text style={styles.lockedName}>
                {dragonById(displayDragonId(profile, todayISODate())).name}
              </Text>
              <Text style={styles.lockedHint}>Locked until tomorrow - pick again on Today.</Text>
            </View>
          ) : null}

          <DragonEvolutionGallery />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <GoalEditor
            profile={profile}
            submitLabel={savedFlash ? 'Saved \u2713' : 'Update goal'}
            saving={saving}
            onSubmit={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
  },
  scroll: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  titleNarrow: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.danger, marginTop: spacing.sm },
  lockedDragon: {
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairlineBright,
    gap: 4,
  },
  lockedLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.accent,
  },
  lockedName: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  lockedHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.accent,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoTap: {
    width: 72,
    height: 72,
  },
  photoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentSurface,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoInitial: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    color: colors.accent,
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  photoHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  nameInput: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  leagueLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    marginTop: spacing.xs,
  },
  leagueLinkTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  leagueLinkHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
