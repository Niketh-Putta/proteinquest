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
  countTodayScans,
  fetchLogsForDate,
  insertLog,
  uploadFoodPhoto,
} from '@/lib/api';
import { applyLogToCharacter } from '@/lib/character';
import { useLayout } from '@/lib/layout';
import { FREE_DAILY_SCANS } from '@/lib/payments';
import { todayISODate } from '@/lib/protein';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import { colors, fonts, radius, spacing, type } from '@/theme';

type Phase = 'camera' | 'analyzing' | 'result';

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
  // Animated horizontal scan line over the photo while analyzing.
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
  const { isNarrow, horizontalPad, contentWidth } = useLayout();
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
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{ evolved: boolean } | null>(null);

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (profile?.is_premium) return;
    countTodayScans()
      .then((used) => setScansLeft(Math.max(FREE_DAILY_SCANS - used, 0)))
      .catch(() => setScansLeft(null));
  }, [profile?.is_premium]);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    setAnalyzeStep(0);
    const t = setInterval(
      () => setAnalyzeStep((s) => Math.min(s + 1, ANALYZING_STEPS.length - 1)),
      1700,
    );
    return () => clearInterval(t);
  }, [phase]);

  async function guardScanAllowance(): Promise<boolean> {
    if (profile?.is_premium) return true;
    const used = await countTodayScans().catch(() => 0);
    if (used >= FREE_DAILY_SCANS) {
      router.push('/paywall');
      return false;
    }
    return true;
  }

  async function capture() {
    if (!(await guardScanAllowance())) return;
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
    if (!(await guardScanAllowance())) return;
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
    setPhase('analyzing');
    setImageUri(uri);
    try {
      const ctx = ImageManipulator.manipulate(uri).resize({ width: 1024 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
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
    if (!analysis || !session || !profile) return;
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

      const { updates, goalJustHit, evolved } = applyLogToCharacter({
        profile,
        todayTotalBefore,
        loggedProtein: proteinG,
        todayISO: todayISODate(),
        yesterdayISO: todayISODate(-1),
      });
      await saveProfile(updates);

      if (goalJustHit) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setCelebration({ evolved });
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
      {/* top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={goHome} hitSlop={12} style={styles.roundBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>
          {phase === 'result' ? 'CONFIRM & LOG' : phase === 'analyzing' ? 'ANALYZING' : 'SCAN MEAL'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {error ? (
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)} hitSlop={8}>
            <Ionicons name="close" size={15} color={colors.textTertiary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {phase === 'camera' && (
        <View style={styles.cameraWrap}>
          {cameraReady ? (
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          ) : (
            <View style={[styles.camera, styles.cameraDenied]}>
              <Ionicons name="videocam-off-outline" size={36} color={colors.textTertiary} />
              <Text style={styles.deniedTitle}>Camera unavailable</Text>
              <Text style={styles.deniedText}>
                {permission?.canAskAgain === false
                  ? 'Camera access was denied. Enable it in your browser/device settings, or upload a photo instead.'
                  : 'Grant camera access to scan your meal, or upload a photo from your library.'}
              </Text>
              {permission?.canAskAgain !== false ? (
                <Button
                  title="Allow camera"
                  variant="secondary"
                  onPress={requestPermission}
                  style={{ marginTop: spacing.md, alignSelf: 'center', minWidth: 180 }}
                />
              ) : null}
            </View>
          )}

          {/* viewfinder frame corners */}
          {cameraReady ? (
            <View pointerEvents="none" style={styles.frame}>
              {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
                <View key={corner} style={[styles.corner, styles[corner]]} />
              ))}
            </View>
          ) : null}

          <View style={styles.controls}>
            {!profile?.is_premium && scansLeft !== null ? (
              <Pressable onPress={() => router.push('/paywall')} style={styles.scansPill}>
                <Ionicons name="sparkles" size={12} color={colors.accent} />
                <Text style={styles.scansPillText}>
                  {scansLeft > 0
                    ? `${scansLeft} FREE SCAN${scansLeft === 1 ? '' : 'S'} LEFT`
                    : 'OUT OF SCANS \u2014 GO PRO'}
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.shutterRow}>
              <Pressable onPress={pickFromLibrary} style={styles.libraryBtn} hitSlop={8}>
                <Ionicons name="images-outline" size={22} color={colors.text} />
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
            { paddingHorizontal: horizontalPad, maxWidth: 428, width: contentWidth, alignSelf: 'center' },
          ]}
          showsVerticalScrollIndicator={false}>
          {imageUri ? (
            <Animated.Image
              entering={FadeIn}
              source={{ uri: imageUri }}
              style={styles.resultImage}
            />
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
            <Text style={styles.foodName}>{analysis.food_name}</Text>
            <View style={styles.metaRow}>
              <View
                style={[
                  styles.confDot,
                  {
                    backgroundColor:
                      analysis.confidence === 'high'
                        ? colors.accent
                        : analysis.confidence === 'medium'
                          ? colors.warning
                          : colors.danger,
                  },
                ]}
              />
              <Text style={styles.metaText}>
                {analysis.confidence?.toUpperCase()} CONFIDENCE
                {analysis.calories ? `  \u00B7  ~${Math.round(analysis.calories)} KCAL` : ''}
              </Text>
            </View>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(160).springify().damping(16)}
            style={styles.itemsCard}>
            {analysis.items.map((item, i) => (
              <View key={`${item.name}-${i}`} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPortion}>{item.portion}</Text>
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

          <Animated.View
            entering={FadeInDown.delay(240).springify().damping(16)}
            style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL PROTEIN</Text>
            <View style={styles.totalInputRow}>
              <TextInput
                style={styles.totalInput}
                value={proteinOverride}
                onChangeText={(t) => setProteinOverride(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.totalUnit}>g</Text>
            </View>
            <Text style={styles.totalHint}>tap the number to adjust</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(320)} style={{ gap: 4 }}>
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
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { ...type.label, color: colors.textSecondary, fontSize: 12 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 122, 107, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 107, 0.35)',
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  cameraWrap: { flex: 1, margin: spacing.md, marginTop: 4 },
  camera: { flex: 1, borderRadius: radius.lg, overflow: 'hidden' },
  cameraDenied: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  deniedTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.text, marginTop: spacing.md },
  deniedText: {
    ...type.body,
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: 22 },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'rgba(200, 240, 82, 0.9)',
  },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 10 },
  bl: { bottom: 96, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 10 },
  br: { bottom: 96, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 10 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(11, 11, 13, 0.78)',
    borderWidth: 1,
    borderColor: colors.hairlineBright,
  },
  scansPillText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.text,
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
    backgroundColor: 'rgba(11, 11, 13, 0.78)',
    borderWidth: 1,
    borderColor: colors.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryBtnPlaceholder: { width: 46 },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
  },
  analyzingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  analyzingImageWrap: {
    width: 240,
    height: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairlineBright,
  },
  analyzingImage: { width: '100%', height: '100%' },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  analyzingTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  analyzingSub: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary, marginTop: 6 },
  resultScroll: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.sm },
  resultImage: {
    width: '100%',
    height: 190,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  foodName: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  confDot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 1, color: colors.textSecondary },
  itemsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: spacing.md },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: colors.hairline },
  itemName: { fontFamily: fonts.displayMedium, fontSize: 14.5, color: colors.text },
  itemPortion: { fontFamily: fonts.mono, fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  itemRight: { alignItems: 'flex-end' },
  itemProtein: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  itemLowConf: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.warning,
    marginTop: 2,
  },
  notes: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' },
  totalCard: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentDeep,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  totalLabel: { ...type.label, color: colors.textSecondary },
  totalInputRow: { flexDirection: 'row', alignItems: 'baseline' },
  totalInput: {
    fontSize: 54,
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 60,
    textAlign: 'center',
  },
  totalUnit: { fontSize: 24, fontFamily: fonts.display, color: colors.accentDeep },
  totalHint: { fontFamily: fonts.mono, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },
});
