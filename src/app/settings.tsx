import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { uploadAvatar } from '@/lib/api';
import { BillingSheet } from '@/components/BillingSheet';
import { FeedToast } from '@/components/FeedToast';
import { SubscriptionBillingInfo } from '@/components/SubscriptionBillingInfo';
import { DragonEvolutionGallery } from '@/components/DragonEvolutionGallery';
import { GoalEditor } from '@/components/GoalEditor';
import {
  DRAGONS,
  buildDragonNames,
  displayDragonId,
  displayDragonName,
  isDailyDragonLockedForToday,
  normalizeDragonName,
} from '@/lib/character';
import {
  DISPLAY_NAME_TAKEN,
  isDisplayNameAvailable,
  isDisplayNameTakenError,
} from '@/lib/display-name';
import { PageCanvas } from '@/components/PageCanvas';
import { useContentColumn, useLayout, useTabBarScrollInset } from '@/lib/layout';
import {
  formatReminderTime,
  getNotificationPermissionStatus,
  isMealRemindersEnabled,
  MEAL_REMINDER_SLOTS,
  setMealRemindersEnabled,
} from '@/lib/meal-reminders';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { DragonId, Profile } from '@/lib/types';
import { setPreferredName } from '@/lib/xp';
import {
  colors,
  displayLH,
  fonts,
  layout,
  pressableWeb,
  radius,
  shadowAccent,
  spacing,
  textInputWeb,
} from '@/theme';

const DRAGON_SPECIES_ICON: Record<DragonId, keyof typeof Ionicons.glyphMap> = {
  fire: 'flame',
  ice: 'snow',
  forest: 'leaf',
};

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

export default function SettingsScreen({ embedded = false }: { embedded?: boolean }) {
  const { profile, session, saveProfile } = useSession();
  const { isNarrow } = useLayout();
  const column = useContentColumn('form');
  const tabBarInset = useTabBarScrollInset(isNarrow);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leagueName, setLeagueName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [remindersOn, setRemindersOn] = useState(true);
  const [remindersBusy, setRemindersBusy] = useState(false);
  const [dragonNameDrafts, setDragonNameDrafts] = useState<Partial<Record<DragonId, string>>>({});
  const [dragonNamesSaved, setDragonNamesSaved] = useState(false);
  const [nameToast, setNameToast] = useState<string | null>(null);
  const nameInputRef = useRef<TextInput>(null);
  const nameHydrated = useRef(false);
  const dragonNamesHydrated = useRef(false);

  useEffect(() => {
    isMealRemindersEnabled().then(setRemindersOn).catch(() => {});
  }, []);

  async function toggleReminders(next: boolean) {
    setRemindersBusy(true);
    setError(null);
    try {
      const ok = await setMealRemindersEnabled(next, profile);
      if (next && !ok) {
        const status = await getNotificationPermissionStatus();
        if (status !== 'granted') {
          setError('Turn on notifications in Settings to get meal reminders.');
        }
        setRemindersOn(false);
      } else {
        setRemindersOn(next);
      }
    } catch {
      setError('Could not update meal reminders.');
      setRemindersOn(!next);
    } finally {
      setRemindersBusy(false);
    }
  }

  useEffect(() => {
    if (!profile || nameHydrated.current) return;
    setLeagueName(profile.display_name ?? '');
    nameHydrated.current = true;
  }, [profile]);

  const avatarUrl = profile?.avatar_url ?? null;

  useEffect(() => {
    if (!profile) return;
    const saved = profile.dragon_names ?? {};
    const dirty = DRAGONS.some((d) => {
      const a = normalizeDragonName(saved[d.id] ?? '');
      const b = normalizeDragonName(dragonNameDrafts[d.id] ?? '');
      return a !== b;
    });
    if (dragonNamesHydrated.current && dirty) return;
    dragonNamesHydrated.current = true;
    setDragonNameDrafts(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync from profile when not mid-edit
  }, [profile?.dragon_names]);

  const dragonNamesDirty = DRAGONS.some((d) => {
    const saved = profile?.dragon_names?.[d.id] ?? '';
    const draft = dragonNameDrafts[d.id] ?? '';
    return normalizeDragonName(draft) !== normalizeDragonName(saved);
  });

  async function commitDragonNames() {
    if (!profile) return;
    const nextNames = buildDragonNames(
      Object.fromEntries(
        DRAGONS.map((d) => [
          d.id,
          normalizeDragonName(dragonNameDrafts[d.id] ?? '') || d.name,
        ]),
      ) as Partial<Record<DragonId, string>>,
    );
    try {
      await saveProfile({ dragon_names: nextNames });
      setDragonNameDrafts(nextNames);
      setError(null);
      setDragonNamesSaved(true);
      setTimeout(() => setDragonNamesSaved(false), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save dragon names.');
      setDragonNameDrafts(profile.dragon_names ?? {});
    }
  }

  const nameDirty = leagueName.trim() !== (profile?.display_name ?? '').trim();

  async function commitName() {
    setNameFocused(false);
    const next = leagueName.trim().slice(0, 24);
    setPreferredName(next).catch(() => {});
    if (next && next !== (profile?.display_name ?? '')) {
      try {
        const available = await isDisplayNameAvailable(next);
        if (!available) {
          setError(null);
          setNameToast(DISPLAY_NAME_TAKEN);
          setLeagueName(profile?.display_name ?? '');
          return;
        }
        await saveProfile({ display_name: next });
        setError(null);
        setNameSaved(true);
        setTimeout(() => setNameSaved(false), 1600);
      } catch (e) {
        if (isDisplayNameTakenError(e)) {
          setError(null);
          setNameToast(DISPLAY_NAME_TAKEN);
        } else {
          setError(e instanceof Error ? e.message : 'Could not save name.');
        }
        setLeagueName(profile?.display_name ?? '');
      }
    }
  }

  async function changePhoto() {
    if (uploadingAvatar) return;
    setError(null);
    try {
      // Request before any error UI — matches App Review camera/photos guidance.
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          perm.canAskAgain === false
            ? 'Photo library access is off. Enable Photos for ProteinQuest in Settings.'
            : 'Photo library access is needed to set a profile picture.',
        );
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

  const root = (
    <SafeAreaView style={styles.safe} edges={embedded ? ['top'] : ['top', 'bottom']}>
      <FeedToast
        visible={!!nameToast}
        message={nameToast ?? ''}
        onHide={() => setNameToast(null)}
      />
      <View style={[styles.topBar, column]}>
        {embedded ? (
          <View style={styles.iconBtn} />
        ) : (
          <Pressable onPress={goHome} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        )}
        <Text style={styles.topTitle}>{embedded ? 'PROFILE' : 'SETTINGS'}</Text>
        <View style={{ width: layout.iconBtn }} />
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            column,
            embedded && { paddingBottom: tabBarInset },
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
            <Pressable
              onPress={() => nameInputRef.current?.focus()}
              style={[styles.nameField, nameFocused && styles.nameFieldFocused]}>
              <TextInput
                ref={nameInputRef}
                value={leagueName}
                onChangeText={setLeagueName}
                onFocus={() => setNameFocused(true)}
                onBlur={commitName}
                onSubmitEditing={commitName}
                returnKeyType="done"
                placeholder="How you appear on the board"
                placeholderTextColor={colors.textTertiary}
                maxLength={24}
                autoCapitalize="words"
                autoCorrect={false}
                editable
                style={[styles.nameInput, textInputWeb]}
              />
              {nameDirty ? (
                <Pressable
                  onPress={commitName}
                  hitSlop={8}
                  style={({ pressed }) => [styles.nameSave, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.nameSaveText}>Save</Text>
                </Pressable>
              ) : nameSaved ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              ) : null}
            </Pressable>
            <Pressable onPress={() => router.push('/league')} style={styles.leagueLink}>
              <View style={{ flex: 1 }}>
                <Text style={styles.leagueLinkTitle}>Protein League</Text>
                <Text style={styles.leagueLinkHint}>See your rank and who&apos;s ahead</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          {Platform.OS !== 'web' ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MEAL REMINDERS</Text>
              <View style={styles.reminderRow}>
                <View style={styles.reminderIcon}>
                  <Ionicons name="notifications-outline" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>Feed your dragon</Text>
                  <Text style={styles.reminderHint}>
                    Daily nudges to log meals and snacks. Tap opens scan.
                  </Text>
                </View>
                <Switch
                  value={remindersOn}
                  onValueChange={toggleReminders}
                  disabled={remindersBusy}
                  trackColor={{ false: colors.hairline, true: colors.accentGlow }}
                  thumbColor={remindersOn ? colors.accent : colors.textTertiary}
                  ios_backgroundColor={colors.hairline}
                />
              </View>
              {remindersOn ? (
                <View style={styles.reminderSchedule}>
                  {MEAL_REMINDER_SLOTS.map((slot) => (
                    <View key={slot.id} style={styles.reminderSlot}>
                      <Text style={styles.reminderSlotLabel}>{slot.label}</Text>
                      <Text style={styles.reminderSlotTime}>
                        {formatReminderTime(slot.hour, slot.minute)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BILLING</Text>
            <Pressable
              onPress={() => setBillingOpen(true)}
              android_ripple={{ color: colors.hairlineBright }}
              style={({ pressed }) => [styles.billingBtn, pressed && styles.billingBtnPressed]}>
              <View style={styles.billingIcon}>
                <Ionicons name="card" size={18} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.billingTitle}>Manage billing</Text>
                <Text style={styles.billingHint}>
                  {profile?.is_premium
                    ? Platform.OS === 'android'
                      ? 'Open Google Play to manage or cancel · restore here'
                      : Platform.OS === 'ios'
                        ? 'Open App Store to manage or cancel · restore here'
                        : 'Manage billing, restore, or cancel'
                    : 'Restore purchases or see plan options'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
            {!profile?.is_premium ? (
              <View style={styles.upgradeGlow}>
                <Pressable
                  onPress={() => router.push('/paywall')}
                  android_ripple={{ color: 'rgba(255, 249, 247, 0.18)' }}
                  accessibilityRole="button"
                  accessibilityLabel="Upgrade to Pro"
                  style={({ pressed }) => [
                    styles.upgradePressable,
                    pressableWeb,
                    pressed && styles.upgradePressed,
                  ]}>
                  <LinearGradient
                    colors={[colors.accentLight, colors.accent, colors.accentDeep]}
                    locations={[0, 0.48, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.upgradeGradient}>
                    <View style={styles.upgradeIcon}>
                      <Ionicons name="star" size={18} color={colors.onAccent} />
                    </View>
                    <View style={styles.upgradeCopy}>
                      <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
                      <Text style={styles.upgradeHint}>
                        Unlimited scans · from $4.99/mo, billed annually
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.onAccent} />
                  </LinearGradient>
                </Pressable>
              </View>
            ) : null}
            {Platform.OS !== 'web' ? (
              <SubscriptionBillingInfo
                key={`${session?.user.id ?? 'anon'}-${profile?.is_premium ? 'pro' : 'free'}`}
                userId={session?.user.id}
                isPro={!!profile?.is_premium}
              />
            ) : null}
          </View>

          {profile && isDailyDragonLockedForToday(profile, todayISODate()) ? (
            <View style={styles.lockedDragon}>
              <Text style={styles.lockedLabel}>TODAY&apos;S DRAGON</Text>
              <Text style={styles.lockedName}>
                {displayDragonName(profile, displayDragonId(profile, todayISODate()))}
              </Text>
              <Text style={styles.lockedHint}>Locked until tomorrow - pick again on Today.</Text>
            </View>
          ) : null}

          <View style={styles.dragonNamesSection}>
            <View style={styles.dragonNamesHeader}>
              <MaterialCommunityIcons
                name="fire"
                size={18}
                color={colors.accentSecondary}
                style={styles.dragonNamesHeaderIcon}
              />
              <View style={styles.dragonNamesHeaderText}>
                <Text style={styles.dragonNamesTitle}>DRAGON NAMES</Text>
                <Text style={styles.dragonNamesSubtitle}>
                  Rename {DRAGONS.map((d) => displayDragonName(profile, d.id)).join(', ')} anytime.
                  Used in reminders and on Today.
                </Text>
              </View>
            </View>

            {DRAGONS.map((dragon) => (
              <View key={dragon.id} style={styles.dragonNameRow}>
                <View style={styles.dragonSpeciesRow}>
                  <Ionicons
                    name={DRAGON_SPECIES_ICON[dragon.id]}
                    size={12}
                    color={dragon.accent}
                  />
                  <Text style={[styles.dragonSpecies, { color: dragon.accent }]}>
                    {dragon.title}
                  </Text>
                </View>
                <View style={styles.dragonNameField}>
                  <TextInput
                    value={dragonNameDrafts[dragon.id] ?? ''}
                    onChangeText={(text) =>
                      setDragonNameDrafts((prev) => ({ ...prev, [dragon.id]: text }))
                    }
                    placeholder={dragon.name}
                    placeholderTextColor={colors.textTertiary}
                    maxLength={24}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={commitDragonNames}
                    style={[
                      styles.dragonNameInput,
                      { borderColor: dragon.accent },
                      textInputWeb,
                    ]}
                  />
                  <View pointerEvents="none" style={styles.dragonNameChevron}>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </View>
              </View>
            ))}
            {dragonNamesDirty ? (
              <Pressable
                onPress={commitDragonNames}
                style={({ pressed }) => [styles.nameSave, pressed && { opacity: 0.85 }]}>
                <Text style={styles.nameSaveText}>Save names</Text>
              </Pressable>
            ) : dragonNamesSaved ? (
              <Text style={styles.savedHint}>Dragon names saved</Text>
            ) : null}
          </View>

          <DragonEvolutionGallery profile={profile} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <GoalEditor
            profile={profile}
            submitLabel={savedFlash ? 'Saved \u2713' : 'Update goal'}
            saving={saving}
            onSubmit={handleSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <BillingSheet
        visible={billingOpen}
        isPro={!!profile?.is_premium}
        onClose={() => setBillingOpen(false)}
        onRestored={() => {
          saveProfile({ is_premium: true }).catch(() => {});
          setBillingOpen(false);
        }}
      />
    </SafeAreaView>
  );

  return <PageCanvas>{root}</PageCanvas>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: layout.iconBtn,
    height: layout.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
  },
  scroll: { paddingTop: spacing.md, paddingBottom: layout.scrollBottomPad },
  title: {
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: displayLH(32),
    color: colors.text,
    letterSpacing: -0.8,
    marginBottom: spacing.xs + 2,
  },
  titleNarrow: { fontSize: 26, lineHeight: displayLH(26), letterSpacing: -0.5 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: layout.sectionGap,
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
  dragonNamesSection: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  dragonNamesHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dragonNamesHeaderIcon: {
    marginTop: 1,
  },
  dragonNamesHeaderText: {
    flex: 1,
    gap: 4,
  },
  dragonNamesTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accentSecondary,
  },
  dragonNamesSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  dragonNameRow: {
    gap: 6,
  },
  dragonSpeciesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  dragonSpecies: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  dragonNameField: {
    position: 'relative',
    justifyContent: 'center',
  },
  dragonNameInput: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderRadius: layout.fieldRadius,
    paddingHorizontal: layout.cardPad,
    paddingRight: 40,
    paddingVertical: 14,
    minHeight: layout.controlHeight,
  },
  dragonNameChevron: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  savedHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.accentSecondary,
    marginTop: spacing.xs,
  },
  section: {
    marginBottom: layout.sectionGap,
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
  nameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: layout.fieldRadius,
    paddingHorizontal: layout.cardPad,
    paddingVertical: 12,
    minHeight: layout.controlHeight,
  },
  nameFieldFocused: {
    borderColor: colors.accent,
  },
  nameInput: {
    flex: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.text,
  },
  nameSave: {
    backgroundColor: colors.accent,
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  nameSaveText: {
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    color: colors.onAccent,
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
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  reminderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  reminderHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 3,
    lineHeight: 17,
  },
  reminderSchedule: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    gap: 6,
  },
  reminderSlot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderSlotLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  reminderSlotTime: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.3,
  },
  billingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    borderRadius: layout.fieldRadius,
    paddingHorizontal: layout.cardPad,
    paddingVertical: 12,
    minHeight: layout.iconBtn,
    overflow: 'hidden',
  },
  billingBtnPressed: { opacity: 0.85 },
  upgradeGlow: {
    marginTop: spacing.sm,
    borderRadius: layout.fieldRadius + 2,
    ...shadowAccent,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: colors.accent,
          shadowOpacity: 0.38,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }
      : null),
  },
  upgradePressable: {
    borderRadius: layout.fieldRadius + 2,
    overflow: 'hidden',
  },
  upgradePressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.cardPad,
    paddingVertical: 14,
    minHeight: layout.controlHeight,
    borderRadius: layout.fieldRadius + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 249, 247, 0.24)',
  },
  upgradeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 249, 247, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  upgradeTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 16,
    letterSpacing: 0.15,
    color: colors.onAccent,
  },
  upgradeHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 249, 247, 0.82)',
  },
  billingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billingTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
  },
  billingHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
