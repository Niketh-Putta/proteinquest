import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Celebration } from '@/components/Celebration';
import { MealPhotoPreview } from '@/components/MealPhotoPreview';
import {
  analyzeFoodPhoto,
  countLifetimeMeals,
  countTodayPhotoScans,
  fetchLogsForDate,
  insertLog,
  recordPhotoScan,
  uploadFoodPhoto,
} from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import {
  applyLogToCharacter,
  displayDragonId,
  displayDragonName,
  isDailyDragonLockedForToday,
} from '@/lib/character';
import { clearNeedsFirstScan, needsFirstScan } from '@/lib/first-scan';
import { useLayout } from '@/lib/layout';
import {
  CALORIE_OVERRIDE_BUFFER,
  PROTEIN_OVERRIDE_BUFFER_G,
  clampCalorieOverride,
  clampProteinOverride,
  maxAllowedOverride,
} from '@/lib/log-limits';
import { prepareSquareMealPhoto, type CameraCrop } from '@/lib/meal-photo';
import { scheduleSecondMealNudge } from '@/lib/meal-reminders';
import {
  canScan,
  isInHabitGracePeriod,
  isPro,
  isScanLimitMessage,
  remainingFreeScans,
} from '@/lib/paywall-gate';
import { todayISODate } from '@/lib/protein';
import { getRetention, markCareDay, rollLootDrop } from '@/lib/retention';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import { colors, displayLH, fonts, spacing, textInputWeb } from '@/theme';

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

function goHome(opts?: {
  fed?: boolean;
  protein?: number;
  loot?: boolean;
  freeze?: boolean;
  food?: string;
}) {
  if (opts?.fed) {
    const q = new URLSearchParams({ fed: '1' });
    if (opts.protein != null) q.set('protein', String(Math.round(opts.protein)));
    if (opts.loot) q.set('loot', '1');
    if (opts.freeze) q.set('freeze', '1');
    if (opts.food?.trim()) q.set('food', opts.food.trim().slice(0, 40));
    router.replace(`/(tabs)/today?${q.toString()}`);
    return;
  }
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
        withTiming(1, { duration: 700, easing: Easing.linear }),
        withTiming(0, { duration: 700, easing: Easing.linear }),
      ),
      -1,
    );
  }, [y]);
  const style = useAnimatedStyle(() => ({
    top: `${8 + y.value * 84}%`,
  }));
  return <Animated.View style={[styles.sweepLine, style]} />;
}

function ScanViewfinder({
  size,
  top,
  left,
}: {
  size: number;
  top: number;
  left: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.dim, { top: 0, left: 0, right: 0, height: top }]} />
      <View style={[styles.dim, { top: top + size, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.dim, { top, left: 0, width: left, height: size }]} />
      <View style={[styles.dim, { top, left: left + size, right: 0, height: size }]} />
      <View style={[styles.squareFrame, { top, left, width: size, height: size }]}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <View key={corner} style={[styles.corner, styles[corner]]} />
        ))}
      </View>
    </View>
  );
}

export default function ScanScreen() {
  const { session, profile, saveProfile } = useSession();
  const { horizontalPad, contentWidth, contentMaxWidth } = useLayout();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cameraViewport, setCameraViewport] = useState({
    width: screenW,
    height: screenH - insets.bottom,
  });
  /** Keep chrome below Dynamic Island / front camera on all phones. */
  const headerTop = Math.max(insets.top, 44) + spacing.md;
  const headerChrome = headerTop + 44 + spacing.sm;
  const noteChrome = 48 + spacing.sm;
  const controlsChrome =
    64 + spacing.lg + Math.max(insets.bottom, spacing.md) + noteChrome;
  const viewfinderSize = Math.min(
    cameraViewport.width - 56,
    cameraViewport.height - headerChrome - controlsChrome - spacing.lg * 2,
  );
  const viewfinderTop =
    headerChrome +
    (cameraViewport.height - headerChrome - controlsChrome - viewfinderSize) / 2;
  const viewfinderLeft = (cameraViewport.width - viewfinderSize) / 2;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  /** Synchronous lock so rapid taps can't launch parallel capture/library flows. */
  const busyRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('camera');
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [capturing, setCapturing] = useState(false);
  /** True when onboarding just finished and Scan is required until they skip or log. */
  const [firstScanRequired, setFirstScanRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  /** Square frame only for live camera viewfinder crops — library keeps full aspect. */
  const [previewSquare, setPreviewSquare] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [proteinOverride, setProteinOverride] = useState('');
  const [calorieOverride, setCalorieOverride] = useState('');
  const [scanNote, setScanNote] = useState('');
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{
    evolved: boolean;
    leveledUp: boolean;
    perkUnlocked: string | null;
    levelBefore: number;
    levelAfter: number;
    previousStageIndex?: number;
  } | null>(null);
  const setCameraRef = useCallback((camera: CameraView | null) => {
    cameraRef.current = camera;
    if (!camera) setCameraInitialized(false);
  }, []);

  const demoAutoScan = isDemoAutoScan();

  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const triggerShutterFlash = useCallback(() => {
    flash.value = withSequence(
      withTiming(0.9, { duration: 55, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
    );
  }, [flash]);

  useEffect(() => {
    if (demoAutoScan) return;
    if (!permission?.granted && permission?.canAskAgain !== false) {
      requestPermission();
    }
  }, [demoAutoScan, permission, requestPermission]);

  useEffect(() => {
    let cancelled = false;
    needsFirstScan().then((needs) => {
      if (!cancelled) setFirstScanRequired(needs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const needsScanQuota =
    !!profile && !isPro(profile) && !isInHabitGracePeriod(profile);

  const openPaywallForLimit = useCallback(() => {
    setError(null);
    setPhase('camera');
    router.push('/paywall');
  }, []);

  /** Refresh the free-scan pill only — never auto-open paywall on focus (dismiss must stick). */
  useFocusEffect(
    useCallback(() => {
      if (!needsScanQuota) {
        setScansLeft(null);
        return;
      }
      let cancelled = false;
      countTodayPhotoScans()
        .then((used) => {
          if (cancelled) return;
          setScansLeft(remainingFreeScans(used, profile));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [needsScanQuota, profile]),
  );

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const t = setInterval(
      () => setAnalyzeStep((s) => Math.min(s + 1, ANALYZING_STEPS.length - 1)),
      900,
    );
    return () => clearInterval(t);
  }, [phase]);

  const onCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCameraViewport((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    }
  }, []);

  async function capture() {
    // Synchronous lock guards against a second tap in the same frame launching
    // a parallel capture before React re-renders `capturing`.
    if (busyRef.current || !cameraReady) return;
    busyRef.current = true;
    setCapturing(true);
    // Instant feedback the moment the shutter is tapped.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    triggerShutterFlash();
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) throw new Error('Could not capture the photo');
      const cameraCrop: CameraCrop = {
        viewportWidth: cameraViewport.width,
        viewportHeight: cameraViewport.height,
        viewfinder: {
          originX: viewfinderLeft,
          originY: viewfinderTop,
          width: viewfinderSize,
          height: viewfinderSize,
        },
      };
      // Keep the live preview in place until the exact viewfinder crop is ready.
      // Showing the raw capture here would briefly use a different cover crop.
      await analyze(photo.uri, cameraCrop);
    } catch (e: any) {
      showError(e.message ?? 'Could not capture the photo. Try again.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  }

  async function pickFromLibrary() {
    if (busyRef.current) return;
    busyRef.current = true;
    setCapturing(true);
    try {
      try {
        const allowed = await ensureCanScan();
        if (needsScanQuota && allowed === null) return;
      } catch {
        /* count failed — allow picker; analyze rechecks */
      }
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
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  }

  function showError(message: string) {
    if (isScanLimitMessage(message)) {
      openPaywallForLimit();
      return;
    }
    setError(message);
    setPhase('camera');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  }

  async function ensureCanScan(): Promise<number | null> {
    if (!needsScanQuota) return null;
    const [used, life] = await Promise.all([countTodayPhotoScans(), countLifetimeMeals()]);
    setScansLeft(remainingFreeScans(used, profile, life));
    if (!canScan(profile, used, life)) {
      openPaywallForLimit();
      return null;
    }
    return used;
  }

  async function analyze(uri: string, cameraCrop?: CameraCrop) {
    setError(null);
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.replace('/(tabs)/today');
      return;
    }

    // Gate before camera work so Today "1 left" and Scan never disagree.
    let usedAtStart: number | null = null;
    try {
      usedAtStart = await ensureCanScan();
      if (needsScanQuota && usedAtStart === null) return;
    } catch {
      /* count failed — allow attempt; analyze path rechecks */
    }

    if (!cameraCrop) {
      setAnalyzeStep(0);
      setPhase('analyzing');
      trackEvent('first_scan_started', {});
    }
    try {
      const [square, used] = await Promise.all([
        prepareSquareMealPhoto(uri, cameraCrop),
        needsScanQuota ? countTodayPhotoScans() : Promise.resolve(null),
      ]);

      setDisplayUri(square.uri);
      setPreviewSquare(Boolean(cameraCrop));
      if (cameraCrop) {
        setAnalyzeStep(0);
        setPhase('analyzing');
        trackEvent('first_scan_started', {});
      }

      const usedNow = used ?? usedAtStart;
      if (needsScanQuota && usedNow !== null) {
        setScansLeft(remainingFreeScans(usedNow, profile));
        if (!canScan(profile!, usedNow)) {
          openPaywallForLimit();
          return;
        }
      }
      setImageBase64(square.base64);

      const res = await analyzeFoodPhoto(square.base64, 'image/jpeg', scanNote);
      if (!res.is_food) {
        showError(res.notes || "This doesn't look like food. Point the camera at your meal.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const proteinG = Number(res.total_protein_g);
      const caloriesN = Number(res.calories);
      const safeProtein = Number.isFinite(proteinG) && proteinG >= 0 ? Math.round(proteinG) : 1;
      const safeCalories =
        Number.isFinite(caloriesN) && caloriesN > 0
          ? Math.round(caloriesN)
          : Math.max(safeProtein * 8, 50);
      setAnalysis({ ...res, total_protein_g: safeProtein, calories: safeCalories });
      setProteinOverride(String(safeProtein));
      setCalorieOverride(String(safeCalories));

      if (needsScanQuota && session?.user.id) {
        await recordPhotoScan(session.user.id);
        setScansLeft(remainingFreeScans((usedNow ?? 0) + 1, profile));
      }

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
    const proteinEntered = parseFloat(proteinOverride);
    if (Number.isNaN(proteinEntered) || proteinEntered < 0) {
      setError('Enter the protein amount in grams.');
      return;
    }
    const proteinClamp = clampProteinOverride(proteinEntered, analysis.total_protein_g);
    if (proteinClamp.clamped) {
      setProteinOverride(String(proteinClamp.max));
      setError(
        `Protein capped at ${proteinClamp.max}g, the most we can verify from this photo. Scan again to log more.`,
      );
      return;
    }
    const proteinG = proteinClamp.value;

    const calorieRaw = calorieOverride.trim();
    const caloriesParsed = calorieRaw.length > 0 ? parseFloat(calorieRaw) : NaN;
    if (calorieRaw.length > 0 && !Number.isFinite(caloriesParsed)) {
      setError('Enter calories as a number.');
      return;
    }
    const caloriesEntered =
      Number.isFinite(caloriesParsed) && caloriesParsed >= 0
        ? Math.round(caloriesParsed)
        : Number.isFinite(analysis.calories) && analysis.calories > 0
          ? Math.round(analysis.calories)
          : Math.max(Math.round(proteinG) * 8, 50);
    const calorieClamp = clampCalorieOverride(caloriesEntered, analysis.calories);
    if (calorieClamp.clamped) {
      setCalorieOverride(String(calorieClamp.max));
      setError(
        `Calories capped at ${calorieClamp.max}, the most we can verify from this photo.`,
      );
      return;
    }
    const calories = calorieClamp.value;
    setSaving(true);
    try {
      const [todayLogs, imagePath] = await Promise.all([
        fetchLogsForDate(todayISODate()),
        imageBase64
          ? uploadFoodPhoto(session.user.id, imageBase64)
          : Promise.resolve(null),
      ]);
      const todayTotalBefore = todayLogs.reduce((s, l) => s + Number(l.protein_g), 0);
      await insertLog({
        userId: session.user.id,
        foodName: analysis.food_name,
        items: analysis.items,
        proteinG,
        calories,
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
        streakFreezeUsed,
      } = applyLogToCharacter({
        profile,
        todayTotalBefore,
        loggedProtein: proteinG,
        todayISO: todayISODate(),
        yesterdayISO: todayISODate(-1),
      });

      const todayISO = todayISODate();
      let retention = markCareDay(getRetention({ ...profile, ...updates }), todayISO);
      const loot = rollLootDrop(retention);
      retention = loot.next;
      const merged = { ...updates, retention };
      const wasFirstEver = await needsFirstScan();
      await saveProfile(merged);
      await clearNeedsFirstScan();

      const mealsToday = todayLogs.length + 1;
      const dragonId = displayDragonId(profile, todayISO);
      const dragonName = displayDragonName(profile, dragonId);
      trackEvent(wasFirstEver ? 'first_meal_logged' : 'meal_logged', {
        protein_g: proteinG,
        meals_today: mealsToday,
      });
      if (loot.dropped) trackEvent('loot_drop', { shards: retention.egg_shards ?? 0 });
      if (streakFreezeUsed) trackEvent('streak_freeze_used', {});
      if (mealsToday === 1) {
        void scheduleSecondMealNudge(dragonName).catch(() => {});
      }

      if (goalJustHit || evolved || leveledUp) {
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
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        goHome({
          fed: true,
          protein: proteinG,
          loot: loot.dropped,
          freeze: streakFreezeUsed,
          food: analysis.food_name,
        });
      }
    } catch (e: any) {
      setError(e.message ?? 'Could not save the log. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const hasCameraPermission = permission?.granted;
  const cameraReady = hasCameraPermission && cameraInitialized;

  const headerTitle =
    phase === 'result' ? 'CONFIRM & LOG' : phase === 'analyzing' ? 'ANALYZING' : 'SCAN MEAL';

  async function skipFirstScan() {
    await clearNeedsFirstScan();
    setFirstScanRequired(false);
    goHome();
  }

  const renderHeader = (overlay = false) => (
    <View
      style={[
        styles.topBar,
        overlay && styles.topBarOverlay,
        { paddingTop: headerTop },
      ]}
      pointerEvents={overlay ? 'box-none' : 'auto'}>
      <Pressable
        onPress={() => {
          if (firstScanRequired) void skipFirstScan();
          else goHome();
        }}
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel={firstScanRequired ? 'Skip for now' : 'Close'}>
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>
      <Text style={[styles.topTitle, overlay && styles.topTitleOverlay]}>{headerTitle}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {phase !== 'camera' || demoAutoScan ? renderHeader() : null}

      {error ? (
        <Animated.View
          entering={FadeInDown.duration(320)}
          style={[
            styles.errorBanner,
            phase === 'camera' && !demoAutoScan
              ? [styles.errorBannerOverlay, { top: headerTop + 44 }]
              : { marginTop: spacing.sm },
          ]}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setError(null)} hitSlop={8}>
            <Ionicons name="close" size={14} color={colors.textTertiary} />
          </Pressable>
        </Animated.View>
      ) : null}

      {phase === 'camera' && !demoAutoScan && (
        <KeyboardAvoidingView
          style={styles.cameraWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          onLayout={onCameraLayout}>
          {renderHeader(true)}
          {hasCameraPermission ? (
            <CameraView
              ref={setCameraRef}
              style={styles.camera}
              facing="back"
              onCameraReady={() => setCameraInitialized(true)}
            />
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

          {hasCameraPermission ? (
            <ScanViewfinder
              size={viewfinderSize}
              top={viewfinderTop}
              left={viewfinderLeft}
            />
          ) : null}

          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
          />

          <View
            style={[
              styles.noteWrap,
              {
                top: viewfinderTop + viewfinderSize + spacing.sm,
                left: viewfinderLeft,
                width: viewfinderSize,
              },
            ]}>
            <TextInput
              style={[styles.noteInput, textInputWeb]}
              value={scanNote}
              onChangeText={setScanNote}
              placeholder="Optional: chicken bowl, no sauce..."
              placeholderTextColor="rgba(232,228,240,0.45)"
              maxLength={280}
              returnKeyType="done"
              autoCorrect
              autoCapitalize="sentences"
              editable={!capturing}
              accessibilityLabel="Optional meal note for AI"
            />
          </View>

          <View style={styles.controls}>
            {firstScanRequired ? (
              <Text style={styles.firstScanHint}>
                No food handy? Upload a photo, or skip and scan later.
              </Text>
            ) : null}
            <View style={styles.shutterRow}>
              <Pressable
                onPress={pickFromLibrary}
                disabled={capturing}
                accessibilityLabel="Upload from library"
                accessibilityRole="button"
                style={[styles.libraryBtn, capturing && { opacity: 0.35 }]}
                hitSlop={8}>
                <Ionicons name="images-outline" size={20} color={colors.text} />
              </Pressable>

              <Pressable
                onPress={capture}
                disabled={!cameraReady || capturing}
                style={({ pressed }) => [
                  styles.shutter,
                  !cameraReady && { opacity: 0.35 },
                  (pressed || capturing) && { transform: [{ scale: 0.92 }] },
                ]}>
                <View style={styles.shutterInner} />
              </Pressable>

              <View style={styles.libraryBtnPlaceholder} />
            </View>
            {firstScanRequired ? (
              <Pressable
                onPress={() => void skipFirstScan()}
                disabled={capturing}
                hitSlop={10}
                style={styles.skipFirstScanBtn}
                accessibilityRole="button"
                accessibilityLabel="Skip scan for now">
                <Text style={styles.skipFirstScanText}>Skip for now</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      )}

      {phase === 'analyzing' && (
        <Animated.View entering={FadeIn} style={styles.analyzingWrap}>
          <View style={styles.analyzingImageWrap}>
            {displayUri ? (
              <View style={styles.analyzingPreviewShell}>
                <MealPhotoPreview uri={displayUri} square={previewSquare} bordered />
                <ScanSweep />
              </View>
            ) : (
              <View style={styles.analyzingPlaceholder} />
            )}
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
          {displayUri ? (
            <Animated.View entering={FadeIn} style={styles.resultImageWrap}>
              <MealPhotoPreview uri={displayUri} square={previewSquare} bordered />
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <Text style={styles.foodName}>{analysis.food_name}</Text>
            <Text style={styles.metaText}>
              {analysis.confidence?.toUpperCase()} CONFIDENCE
            </Text>
            {scansLeft !== null ? (
              <Pressable onPress={() => router.push('/paywall')} style={styles.scansPill}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.scansPillText}>
                  {scansLeft > 0
                    ? `${scansLeft} free scan${scansLeft === 1 ? '' : 's'} left today`
                    : 'Out of free scans. Go Pro'}
                </Text>
              </Pressable>
            ) : null}
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
                style={[
                  styles.totalInput,
                  textInputWeb,
                  Platform.OS === 'web'
                    ? ({ width: `${Math.max(proteinOverride.length, 1)}ch` } as object)
                    : null,
                ]}
                value={proteinOverride}
                onChangeText={(t) => setProteinOverride(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.totalUnit}>g</Text>
            </View>
            <Text style={styles.totalHint}>
              tap to adjust · max {maxAllowedOverride(analysis.total_protein_g, PROTEIN_OVERRIDE_BUFFER_G)}g
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.totalBlock}>
            <Text style={styles.totalLabel}>CALORIES</Text>
            <View style={styles.totalInputRow}>
              <TextInput
                style={[
                  styles.totalInput,
                  textInputWeb,
                  Platform.OS === 'web'
                    ? ({ width: `${Math.max(calorieOverride.length, 1)}ch` } as object)
                    : null,
                ]}
                value={calorieOverride}
                onChangeText={(t) => setCalorieOverride(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.totalUnit}>cal</Text>
            </View>
            <Text style={styles.totalHint}>
              tap to adjust · max {maxAllowedOverride(analysis.calories, CALORIE_OVERRIDE_BUFFER)}
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(320)} style={{ gap: 4, marginTop: spacing.lg }}>
            <Button title="Log it" onPress={handleSave} loading={saving} />
            <Button
              title="Retake"
              variant="ghost"
              onPress={() => {
                setAnalysis(null);
                setDisplayUri(null);
                setImageBase64(null);
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
            goHome({
              fed: true,
              protein: Number(proteinOverride) || undefined,
              food: analysis?.food_name,
            });
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
    paddingBottom: spacing.sm,
  },
  topBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topTitleOverlay: {
    color: colors.text,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
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
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(12, 11, 16, 0.88)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.danger,
  },
  errorBannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    marginBottom: 0,
  },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.danger },
  cameraWrap: { flex: 1 },
  noteWrap: {
    position: 'absolute',
    zIndex: 8,
  },
  noteInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(12, 11, 16, 0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
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
  flash: {
    backgroundColor: '#fff',
    opacity: 0,
    zIndex: 5,
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 11, 16, 0.55)',
  },
  squareFrame: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: colors.accent,
  },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  firstScanHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    marginBottom: spacing.xs,
  },
  skipFirstScanBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipFirstScanText: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
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
    width: '100%',
    maxWidth: 360,
    marginBottom: spacing.xl,
  },
  analyzingPreviewShell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  analyzingPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
  },
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
  resultImageWrap: {
    width: '85%',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  foodName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
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
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineBright,
    backgroundColor: colors.surface,
  },
  scansPillText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.textSecondary,
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
  totalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  totalInput: {
    fontSize: 56,
    lineHeight: displayLH(56),
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 40,
    letterSpacing: -2,
  },
  totalUnit: {
    fontSize: 22,
    lineHeight: displayLH(22),
    fontFamily: fonts.display,
    color: colors.textTertiary,
    marginBottom: 10,
    marginLeft: 2,
  },
  totalCal: {
    fontSize: 14,
    fontFamily: fonts.mono,
    color: colors.textTertiary,
    marginBottom: 10,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  totalHint: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
