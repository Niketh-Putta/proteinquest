import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Celebration } from '@/components/Celebration';
import {
  analyzeFoodPhoto,
  countTodayPhotoScans,
  fetchLogsForDate,
  insertLog,
  uploadFoodPhoto,
} from '@/lib/api';
import { applyLogToCharacter, isDailyDragonLockedForToday } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { canScan } from '@/lib/paywall-gate';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import { colors, fonts, spacing, textInputWeb } from '@/theme';

type Phase = 'camera' | 'analyzing' | 'result';

const DEMO_AUTO_SCAN_KEY = 'pq_demo_auto_scan';

function isDemoAutoScan(): boolean {
  if (Platform.OS !== 'web') return false;
  try {
    return sessionStorage.getItem(DEMO_AUTO_SCAN_KEY) === '1';
  } catch {
    return false;
  }
}

function goHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/today');
}

const ANALYZING_STEPS = [
  'Identifying foods\u2026',
  'Estimating portions\u2026',
  'Counting protein\u2026',
];

function ScanSweep() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [y]);
  const style = useAnimatedStyle(() => ({
    top: `${8 + y.value * 84}%`,
  }));
  return <Animated.View style={[styles.sweepLine, style]} />;
}

export default function ScanScreen() {
  const { session, profile, saveProfile } = useSession();
  const { horizontalPad, contentWidth, contentMaxWidth } = useLayout();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [phase, setPhase] = useState<Phase>('camera');
  const [error, setError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [proteinOverride, setProteinOverride] = useState('');
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [celebration, setCelebration] = useState<{
    evolved: boolean;
    leveledUp: boolean;
    perkUnlocked: string | null;
    levelBefore: number;
    levelAfter: number;
    previousStageIndex?: number;
  } | null>(null);

  const demoAutoScan = isDemoAutoScan();

  useEffect(() => {
    if (demoAutoScan) return;
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [demoAutoScan, permission, requestPermission]);

  useEffect(() => {
    if (!demoAutoScan || phase !== 'camera') return;
    sessionStorage.removeItem(DEMO_AUTO_SCAN_KEY);
    pickFromLibrary();
  }, [demoAutoScan, phase]);

  useEffect(() => {
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.replace('/(tabs)/today');
    }
  }, [profile]);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    setAnalyzeStep(0);
    const t = setInterval(
      () => setAnalyzeStep((s) => Math.min(s + 1, ANALYZING_STEPS.length - 1)),
      1700,
    );
    return () => clearInterval(t);
  }, [phase]);

  async function capture() {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('Could not capture the photo');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      await analyze(photo.uri);
    } catch (e: any) {
      showError(e.message ?? 'Could not capture the photo. Try again.');
    }
  }

  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError('Photo library access is needed to upload a meal photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    await analyze(result.assets[0].uri);
  }

  function showError(message: string) {
    setError(message);
    setPhase('camera');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }

  async function analyze(uri: string) {
    setError(null);
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.replace('/(tabs)/today');
      return;
    }
    if (profile && !profile.is_premium) {
      const used = await countTodayPhotoScans();
      if (!canScan(profile, used)) {
        router.push('/paywall');
        return;
      }
    }
    setPhase('analyzing');
    setImageUri(uri);
    try {
      const ctx = ImageManipulator.manipulate(uri).resize({ width: 768 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.65,
        base64: true,
      });
      if (!saved.base64) {
        throw new Error(
          'Could not read that image. If it came from your library, try a JPEG or PNG.',
        );
      }
      setImageUri(saved.uri);
      setImageBase64(saved.base64);

      const res = await analyzeFoodPhoto(saved.base64);
      if (!res.is_food) {
        showError(res.notes || "This doesn't look like food. Point the camera at your meal.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setAnalysis(res);
      setProteinOverride(String(Math.round(res.total_protein_g)));
      setPhase('result');
    } catch (e: any) {
      showError(e.message ?? 'Analysis failed. Check your connection and try again.');
    }
  }

  async function handleSave() {
    if (!analysis || !session) return;
    if (!profile) {
      setError('Profile still loading - wait a second and tap Log it again.');
      return;
    }
    const proteinG = parseFloat(proteinOverride);
    if (Number.isNaN(proteinG) || proteinG < 0) {
      setError('Enter the protein amount in grams.');
      return;
    }
    setSaving(true);
    try {
      const todayLogs = await fetchLogsForDate(todayISODate());
      const todayTotalBefore = todayLogs.reduce((s, l) => s + Number(l.protein_g), 0);

      const imagePath = imageBase64
        ? await uploadFoodPhoto(session.user.id, imageBase64)
        : null;
      await insertLog({
        userId: session.user.id,
        foodName: analysis.food_name,
        items: analysis.items,
        proteinG,
        calories: analysis.calories ? Math.round(analysis.calories) : null,
        confidence: analysis.confidence,
        imagePath,
        source: 'photo',
      });

      const {
        updates,
        goalJustHit,
        evolved,
        leveledUp,
        perkUnlocked,
        levelBefore,
        levelAfter,
        stageBeforeIndex,
      } = applyLogToCharacter({
        profile,
        todayTotalBefore,
        loggedProtein: proteinG,
        todayISO: todayISODate(),
        yesterdayISO: todayISODate(-1),
      });
      await saveProfile(updates);

      if (goalJustHit) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setCelebration({
          evolved,
          leveledUp,
          perkUnlocked,
          levelBefore,
          levelAfter,
          previousStageIndex: stageBeforeIndex,
        });
      } else {
        goHome();
      }
    } catch (e: any) {
      setError(e.message ?? 'Could not save the log. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const cameraReady = permission?.granted;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable onPress={goHome} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>
          {phase === 'result' ? 'CONFIRM & LOG' : phase === 'analyzing' ? 'ANALYZING' : 'SCAN MEAL'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {error ? (
        <Animated.View entering={FadeInDown.duration(320)} style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)} hitSlop={8}>
            <Ionicons name="close" size={14} color={colors.textTertiary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {phase === 'camera' && !demoAutoScan && (
        <View style={styles.cameraWrap}>
          {cameraReady ? (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          ) : (
            <View style={[styles.camera, styles.cameraDenied]}>
              <Ionicons name="videocam-off-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.deniedTitle}>Camera unavailable</Text>
              <Text style={styles.deniedText}>
                {permission?.canAskAgain === false
                  ? 'Camera access was denied. Enable it in settings, or upload a photo instead.'
                  : 'Grant camera access to scan your meal, or upload from your library.'}
              </Text>
              {permission?.canAskAgain !== false ? (
                <Button
                  title="Allow camera"
                  variant="secondary"
                  onPress={requestPermission}
                  style={{ marginTop: spacing.lg, alignSelf: 'center', minWidth: 180 }}
                />
              ) : null}
            </View>
          )}

          {cameraReady ? (
            <View style={[styles.frame, { pointerEvents: 'none' }]}>
              {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                <View key={corner} style={[styles.corner, styles[corner]]} />
              ))}
            </View>
          ) : null}

          <View style={styles.controls}>
            <View style={styles.shutterRow}>
              <Pressable
                onPress={pickFromLibrary}
                accessibilityLabel="Upload from library"
                accessibilityRole="button"
                style={styles.libraryBtn}
                hitSlop={8}>
                <Ionicons name="images-outline" size={20} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={capture}
                disabled={!cameraReady}
                style={({ pressed }) => [
                  styles.shutter,
                  !cameraReady && { opacity: 0.35 },
                  pressed && { transform: [{ scale: 0.92 }] },
                ]}>
                <View style={styles.shutterInner} />
              </Pressable>

              <View style={styles.libraryBtnPlaceholder} />
            </View>
          </View>
        </View>
      )}

      {phase === 'analyzing' && (
        <Animated.View entering={FadeIn} style={styles.analyzingWrap}>
          <View style={styles.analyzingImageWrap}>
            {imageUri ? <Image source={{ uri: imageUri }} style={styles.analyzingImage} /> : null}
            <ScanSweep />
          </View>
          <Text style={styles.analyzingTitle}>{ANALYZING_STEPS[analyzeStep]}</Text>
          <Text style={styles.analyzingSub}>AI is reading your plate</Text>
        </Animated.View>
      )}

      {phase === 'result' && analysis && (
        <ScrollView
          contentContainerStyle={[
            styles.resultScroll,
            {
              paddingHorizontal: horizontalPad,
              maxWidth: contentMaxWidth,
              width: contentWidth,
              alignSelf: 'center',
            },
          ]}
          showsVerticalScrollIndicator={false}>
          {imageUri ? (
            <Animated.Image
              entering={FadeIn}
              source={{ uri: imageUri }}
              style={styles.resultImage}
            />
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <Text style={styles.foodName}>{analysis.food_name}</Text>
            <Text style={styles.metaText}>
              {analysis.confidence?.toUpperCase()} CONFIDENCE
              {analysis.calories ? `  ·  ~${Math.round(analysis.calories)} KCAL` : ''}
            </Text>
          </Animated.View>

          <View style={styles.rule} />

          <Animated.View entering={FadeInDown.delay(160).duration(400)}>
            {analysis.items.map((item, i) => (
              <View key={`${item.name}-${i}`} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPortion}>
                    {item.estimated_grams ? `~${item.estimated_grams}g · ` : ''}
                    {item.portion}
                  </Text>
                </View>
                <View style={styles.itemRight}>
                  <Text style={styles.itemProtein}>
                    {item.protein_g < 10 ? item.protein_g.toFixed(1) : Math.round(item.protein_g)}g
                  </Text>
                  {item.confidence === 'low' ? (
                    <Text style={styles.itemLowConf}>low conf.</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Animated.View>

          {analysis.notes ? (
            <Animated.Text entering={FadeIn.delay(260)} style={styles.notes}>
              {analysis.notes}
            </Animated.Text>
          ) : null}

          <View style={styles.rule} />

          <Animated.View entering={FadeInDown.delay(240).duration(400)} style={styles.totalBlock}>
            <Text style={styles.totalLabel}>TOTAL PROTEIN</Text>
            <View style={styles.totalInputRow}>
              <TextInput
                style={[styles.totalInput, textInputWeb]}
                value={proteinOverride}
                onChangeText={(t) => setProteinOverride(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.totalUnit}>g</Text>
            </View>
            <Text style={styles.totalHint}>tap to adjust</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(320)} style={{ gap: 4, marginTop: spacing.lg }}>
            <Button title="Log it" onPress={handleSave} loading={saving} />
            <Button
              title="Retake"
              variant="ghost"
              onPress={() => {
                setAnalysis(null);
                setError(null);
                setPhase('camera');
              }}
            />
          </Animated.View>
        </ScrollView>
      )}

      {profile ? (
        <Celebration
          visible={!!celebration}
          profile={profile}
          evolved={celebration?.evolved ?? false}
          leveledUp={celebration?.leveledUp ?? false}
          perkUnlocked={celebration?.perkUnlocked}
          levelBefore={celebration?.levelBefore}
          levelAfter={celebration?.levelAfter}
          previousStageIndex={celebration?.previousStageIndex}
          onDone={() => {
            setCelebration(null);
            goHome();
          }}
        />
      ) : null}
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.danger,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  cameraWrap: { flex: 1 },
  camera: { flex: 1, overflow: 'hidden' },
  cameraDenied: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  deniedTitle: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.text,
    marginTop: spacing.md,
  },
  deniedText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
    lineHeight: 19,
  },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: 28 },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: colors.accent,
  },
  tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: 96, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: 96, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.lg,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.xl,
  },
  libraryBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 11, 16, 0.78)',
    borderWidth: 1,
    borderColor: colors.hairlineBright,
  },
  libraryBtnPlaceholder: { width: 46 },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  shutterInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
  },
  analyzingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  analyzingImageWrap: {
    width: 220,
    height: 220,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
  analyzingImage: { width: '100%', height: '100%' },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  analyzingTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.3,
  },
  analyzingSub: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 8,
    letterSpacing: 0.5,
  },
  resultScroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  resultImage: {
    width: '100%',
    height: 200,
    marginBottom: spacing.lg,
  },
  foodName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    color: colors.text,
    letterSpacing: -0.8,
  },
  metaText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textTertiary,
    marginTop: 6,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    marginVertical: spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: spacing.md,
  },
  itemRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  itemName: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.text },
  itemPortion: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  itemRight: { alignItems: 'flex-end' },
  itemProtein: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  itemLowConf: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.warning,
    marginTop: 2,
  },
  notes: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  totalBlock: { alignItems: 'flex-start' },
  totalLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textTertiary,
  },
  totalInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 4 },
  totalInput: {
    fontSize: 56,
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 60,
    letterSpacing: -2,
  },
  totalUnit: { fontSize: 22, fontFamily: fonts.display, color: colors.textTertiary, marginBottom: 8 },
  totalHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
