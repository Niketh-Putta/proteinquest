import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
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
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { Button } from '@/components/Button';
import { Celebration } from '@/components/Celebration';
import { GlassPanel } from '@/components/GlassPanel';
import { MealPhotoPreview } from '@/components/MealPhotoPreview';
import {
  analyzeFoodPhoto,
  countLifetimeMeals,
  countTodayPhotoScans,
  fetchTodayMealSummary,
  insertLog,
  recordPhotoScan,
  getFoodPhotoUrl,
  updateLogImagePath,
  uploadFoodPhoto,
} from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import { rememberLocalMealPhoto } from '@/lib/local-meal-photo';
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
import { pickLibraryImage } from '@/lib/pick-library-image';
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
import { consumePendingIngredientEdit } from '@/lib/scan-ingredient-edit';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import {
  colors,
  displayLH,
  fonts,
  pressableWeb,
  radius,
  shadowCard,
  spacing,
  textInputWeb,
} from '@/theme';

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

function formatScanMeta(scannedAt: Date | null): string {
  const d = scannedAt ?? new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const today = todayISODate();
  const scannedDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (scannedDay === today) return `Scanned today, ${time}`;
  return `Scanned ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

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

function AnalyzingCornerBrackets({ scale = 1 }: { scale?: number }) {
  const corner = Math.max(22, Math.round(30 * scale));
  const inset = Math.max(10, Math.round(12 * scale));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((key) => (
        <View
          key={key}
          style={[
            styles.corner,
            styles[key],
            {
              width: corner,
              height: corner,
              top: key === 'tl' || key === 'tr' ? inset : undefined,
              bottom: key === 'bl' || key === 'br' ? inset : undefined,
              left: key === 'tl' || key === 'bl' ? inset : undefined,
              right: key === 'tr' || key === 'br' ? inset : undefined,
            },
          ]}
        />
      ))}
    </View>
  );
}

function AnalyzingProgressBar({ progress }: { progress: number }) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));
  return (
    <View
      style={styles.analyzeProgressTrack}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(progress * 100), min: 0, max: 100 }}>
      <Animated.View style={[styles.analyzeProgressFill, fillStyle]} />
    </View>
  );
}

function ScanViewfinder({
  size,
  top,
  left,
  viewportW,
  viewportH,
  scale = 1,
  onOutsidePress,
}: {
  size: number;
  top: number;
  left: number;
  viewportW: number;
  viewportH: number;
  scale?: number;
  onOutsidePress?: () => void;
}) {
  /** Mild rectangle radius so brackets + dim hole stay aligned. */
  const radius = Math.max(10, Math.min(16, Math.round(size * 0.045)));
  const corner = Math.max(18, Math.round(28 * scale));
  const inset = Math.max(8, Math.round(10 * scale));
  const iconSize = Math.max(24, Math.round(36 * scale));
  const titleSize = Math.max(12, Math.round(15 * scale));
  const subSize = Math.max(11, Math.round(13 * scale));
  const showGuide = size >= 180;
  const maskId = 'scan-finder-hole';
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
        onPress={onOutsidePress}
        style={StyleSheet.absoluteFill}>
        <Svg width={viewportW} height={viewportH} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id={maskId}>
              <Rect x={0} y={0} width={viewportW} height={viewportH} fill="#fff" />
              <Rect
                x={left}
                y={top}
                width={size}
                height={size}
                rx={radius}
                ry={radius}
                fill="#000"
              />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={viewportW}
            height={viewportH}
            fill="rgba(12, 11, 16, 0.62)"
            mask={`url(#${maskId})`}
          />
        </Svg>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss keyboard"
        onPress={onOutsidePress}
        style={[
          styles.finderGlass,
          {
            top,
            left,
            width: size,
            height: size,
            borderRadius: radius,
          },
        ]}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((key) => (
          <View
            key={key}
            pointerEvents="none"
            style={[
              styles.corner,
              styles[key],
              {
                width: corner,
                height: corner,
                top: key === 'tl' || key === 'tr' ? inset : undefined,
                bottom: key === 'bl' || key === 'br' ? inset : undefined,
                left: key === 'tl' || key === 'bl' ? inset : undefined,
                right: key === 'tr' || key === 'br' ? inset : undefined,
              },
            ]}
          />
        ))}
        {showGuide ? (
          <View pointerEvents="none" style={[styles.finderGuide, { gap: Math.round(8 * scale) }]}>
            <Ionicons name="restaurant-outline" size={iconSize} color={colors.accent} />
            <Text style={[styles.finderGuideTitle, { fontSize: titleSize }]}>CENTER YOUR MEAL</Text>
            <Text style={[styles.finderGuideSub, { fontSize: subSize }]}>Make sure it's well lit</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export default function ScanScreen() {
  const { session, profile, saveProfile } = useSession();
  const { horizontalPad, contentWidth, contentMaxWidth, isWide, isDesktop, isTablet } = useLayout();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cameraViewport, setCameraViewport] = useState({
    width: screenW,
    height: screenH - insets.bottom,
  });
  const [topChromeH, setTopChromeH] = useState(0);
  const [botChromeH, setBotChromeH] = useState(0);
  /** True when onboarding just finished and Scan is required until they skip or log. */
  const [firstScanRequired, setFirstScanRequired] = useState(false);

  /** Keep chrome below Dynamic Island / front camera on all phones. */
  const vw = cameraViewport.width;
  const vh = cameraViewport.height;
  const shortSide = Math.min(vw, vh);
  const landscape = vw > vh * 1.05;
  const tinyH = vh < 620 || (landscape && vh < 420);
  const compactH = !tinyH && (vh < 740 || (landscape && vh < 520));
  const tallH = vh >= 900 && !landscape;
  /** Scale UI from a phone reference; dampen on huge tablets so chrome doesn't balloon. */
  const uiScale = Math.min(
    isDesktop ? 1.08 : isTablet ? 1.05 : 1.12,
    Math.max(0.76, Math.min(shortSide / 390, vh / (landscape ? 420 : 780))),
  );
  const showHeroSub = !tinyH && !landscape;
  const showHeroIcon = !tinyH;
  const heroPadV = tinyH || landscape ? 0 : compactH ? 2 : tallH ? spacing.sm : spacing.xs;
  const headerTop =
    Math.max(insets.top, Platform.OS === 'web' ? 20 : 12) + spacing.sm;
  const edgePad = Math.max(insets.left, spacing.md);
  const titleBlockEst = Math.round(
    ((showHeroIcon ? 22 : 0) + (showHeroSub ? 56 : 34) + heroPadV * 2) * Math.min(uiScale, 1),
  );
  const noteChromeEst = Math.round((tinyH ? 44 : compactH ? 50 : 56) * Math.min(uiScale, 1));
  const shutterSize = Math.round(
    (tinyH ? 60 : compactH ? 70 : isTablet || isDesktop ? 82 : 78) * Math.min(uiScale, 1.06),
  );
  const librarySize = Math.round(
    (tinyH ? 42 : isTablet || isDesktop ? 56 : 52) * Math.min(uiScale, 1.06),
  );
  const controlsChromeEst =
    shutterSize +
    26 +
    (firstScanRequired ? 34 : 0) +
    Math.max(insets.bottom, spacing.md) +
    spacing.sm;
  const headerChromeEst = headerTop + 44 + titleBlockEst;
  /** Phone column stays app-like; tablet/desktop keep a focused scan stage. */
  const stageMaxWidth = isDesktop ? 520 : isTablet ? 460 : Math.min(contentMaxWidth, landscape ? 520 : 420);
  const stageWidth = Math.min(vw, stageMaxWidth);
  const sideGutter = Math.max(
    tinyH ? 12 : 16,
    Math.round((isTablet || isDesktop ? 28 : 22) * Math.min(uiScale, 1)),
  );
  const finderCap = landscape
    ? Math.min(280, vh * 0.55)
    : isDesktop
      ? 380
      : isTablet
        ? 340
        : Math.min(tallH ? 380 : 360, shortSide - sideGutter * 2);
  const topReserve = topChromeH > 0 ? topChromeH : headerChromeEst + noteChromeEst;
  const botReserve = botChromeH > 0 ? botChromeH : controlsChromeEst;
  const chromeGap = tinyH || landscape ? spacing.md : spacing.lg;
  const bottomGap = tinyH ? spacing.md : landscape ? spacing.sm : isTablet || isDesktop ? spacing.xl : spacing.lg;
  const availableForFinder = Math.max(
    128,
    vh - topReserve - botReserve - chromeGap - bottomGap,
  );
  const viewfinderSize = Math.max(
    128,
    Math.min(stageWidth - sideGutter * 2, availableForFinder, finderCap),
  );
  /** Prefer optical center; clamp so note + shutter never collide with the square. */
  const idealTop = (vh - viewfinderSize) / 2 - (landscape ? 0 : Math.min(12, vh * 0.01));
  const minTop = topReserve + chromeGap;
  const maxTop = Math.max(minTop, vh - botReserve - bottomGap - viewfinderSize);
  const viewfinderTop = Math.min(maxTop, Math.max(minTop, idealTop));
  const viewfinderLeft = (vw - viewfinderSize) / 2;
  const stageLeft = (vw - stageWidth) / 2;
  const heroTitleSize = Math.round(
    (tinyH ? 20 : compactH ? 24 : isTablet || isDesktop ? 30 : 28) * Math.min(uiScale, 1.06),
  );
  const heroSubSize = Math.round((isTablet ? 15 : 14) * Math.min(uiScale, 1));
  const notePillMax = Math.min(viewfinderSize, stageWidth - sideGutter * 2);
  const chromeColumnStyle = {
    maxWidth: stageMaxWidth,
    width: '100%' as const,
    alignSelf: 'center' as const,
    paddingHorizontal: Math.max(0, viewfinderLeft - stageLeft),
  };
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  /** Synchronous lock so rapid taps can't launch parallel capture/library flows. */
  const busyRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('camera');
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  /** Square frame only for live camera viewfinder crops — library keeps full aspect. */
  const [previewSquare, setPreviewSquare] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [proteinOverride, setProteinOverride] = useState('');
  const [calorieOverride, setCalorieOverride] = useState('');
  const [scanNote, setScanNote] = useState('');
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const foodNameRef = useRef<TextInput>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardActionRef = useRef<null | (() => void)>(null);
  const phaseRef = useRef<Phase>(phase);
  const analysisRef = useRef<Analysis | null>(analysis);
  /** Upload starts as soon as analysis succeeds so Log it rarely waits on storage. */
  const photoUploadRef = useRef<Promise<string | null> | null>(null);
  phaseRef.current = phase;
  analysisRef.current = analysis;
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const analyzeStepRef = useRef(0);
  const analyzeDoneRef = useRef(false);
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
      520,
    );
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    analyzeStepRef.current = analyzeStep;
  }, [analyzeStep]);

  useEffect(() => {
    if (phase !== 'analyzing') {
      setAnalyzeProgress(0);
      analyzeDoneRef.current = false;
      return;
    }
    analyzeDoneRef.current = false;
    setAnalyzeProgress(0.1);
    const startedAt = Date.now();
    const tick = () => {
      if (analyzeDoneRef.current) return;
      const elapsed = Date.now() - startedAt;
      const stepBase = [0.18, 0.42, 0.62][analyzeStepRef.current] ?? 0.62;
      const timeBoost = 0.28 * (1 - Math.exp(-elapsed / 2400));
      setAnalyzeProgress(Math.min(0.92, stepBase + timeBoost));
    };
    tick();
    const t = setInterval(tick, 80);
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

  useEffect(() => {
    setTopChromeH(0);
    setBotChromeH(0);
  }, [cameraViewport.width, cameraViewport.height]);

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
      // High capture quality + native processing (no skipProcessing) for a sharp plate photo.
      // Export still caps at EXPORT_MAX_SIDE so analyze/upload stay snappy.
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
        shutterSound: false,
      });
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
      const picked = await pickLibraryImage();
      if (!picked?.uri) return;
      await analyze(picked.uri);
    } catch (e: any) {
      showError(e?.message ?? 'Could not open your photo library. Try again.');
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
      setScannedAt(new Date());

      // Kick off storage upload while the user reviews CONFIRM & LOG.
      if (session?.user.id) {
        photoUploadRef.current = uploadFoodPhoto(session.user.id, square.base64);
      }

      if (needsScanQuota && session?.user.id) {
        await recordPhotoScan(session.user.id);
        setScansLeft(remainingFreeScans((usedNow ?? 0) + 1, profile));
      }

      setAnalyzeProgress(1);
      analyzeDoneRef.current = true;
      await new Promise((r) => setTimeout(r, 60));
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
      const todayISO = todayISODate();
      const foodName = analysis.food_name.trim() || 'Meal';
      const uploadPromise =
        photoUploadRef.current ??
        (imageBase64
          ? uploadFoodPhoto(session.user.id, imageBase64)
          : Promise.resolve(null));

      // Upload usually finishes during review; await it so Today has image_path immediately.
      const [todaySummary, wasFirstEver, imagePath] = await Promise.all([
        fetchTodayMealSummary(todayISO),
        needsFirstScan(),
        uploadPromise.catch(() => null),
      ]);

      const log = await insertLog({
        userId: session.user.id,
        foodName,
        items: analysis.items,
        proteinG,
        calories,
        confidence: analysis.confidence,
        imagePath: imagePath ?? null,
        source: 'photo',
      });

      // Instant Today thumb from the local capture (before signed URL is ready).
      if (displayUri) rememberLocalMealPhoto(log.id, displayUri);

      if (imagePath) {
        void getFoodPhotoUrl(imagePath);
      } else if (imageBase64) {
        // Upload lagged or failed — attach in background without blocking home.
        void uploadFoodPhoto(session.user.id, imageBase64)
          .then(async (path) => {
            if (!path) return;
            await updateLogImagePath(log.id, path);
            void getFoodPhotoUrl(path);
          })
          .catch(() => {});
      }

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
        todayTotalBefore: todaySummary.proteinSum,
        loggedProtein: proteinG,
        todayISO,
        yesterdayISO: todayISODate(-1),
      });

      let retention = markCareDay(getRetention({ ...profile, ...updates }), todayISO);
      const loot = rollLootDrop(retention);
      retention = loot.next;
      const merged = { ...updates, retention };
      await Promise.all([saveProfile(merged), clearNeedsFirstScan()]);

      const mealsToday = todaySummary.mealCount + 1;
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

  const resetToCamera = useCallback(() => {
    setAnalysis(null);
    setDisplayUri(null);
    setImageBase64(null);
    photoUploadRef.current = null;
    setError(null);
    setProteinOverride('');
    setCalorieOverride('');
    setScannedAt(null);
    setPhase('camera');
  }, []);

  useFocusEffect(
    useCallback(() => {
      const edit = consumePendingIngredientEdit();
      if (!edit) return;
      let nextProteinStr: string | null = null;
      let nextCaloriesStr: string | null = null;
      setAnalysis((prev) => {
        if (!prev) return prev;
        const action = edit.action ?? 'update';
        let items = [...prev.items];

        if (action === 'delete') {
          if (edit.index < 0 || edit.index >= items.length) return prev;
          items = items.filter((_, i) => i !== edit.index);
        } else if (action === 'add') {
          items.push({
            name: edit.name,
            portion: edit.portion,
            protein_g: edit.protein_g,
            calories_g: edit.calories_g,
            estimated_grams: edit.estimated_grams,
            confidence: 'medium',
          });
        } else {
          const current = items[edit.index];
          if (!current) return prev;
          items[edit.index] = {
            ...current,
            name: edit.name,
            portion: edit.portion,
            protein_g: edit.protein_g,
            calories_g: edit.calories_g,
            estimated_grams: edit.estimated_grams,
          };
        }

        const totalProtein = items.reduce((s, i) => s + (Number(i.protein_g) || 0), 0);
        const totalCalories = items.reduce((s, i) => {
          const c = Number(i.calories_g);
          return s + (Number.isFinite(c) && c >= 0 ? c : 0);
        }, 0);
        const nextProtein = Math.round(totalProtein * 10) / 10;
        const nextCalories = Math.round(totalCalories);
        nextProteinStr = String(nextProtein);
        nextCaloriesStr = String(nextCalories);
        return {
          ...prev,
          items,
          total_protein_g: nextProtein,
          calories: nextCalories,
          food_name:
            items.length === 0
              ? prev.food_name
              : items.length === 1
                ? items[0].name
                : items.map((i) => i.name).slice(0, 3).join(' + '),
        };
      });
      if (nextProteinStr != null) setProteinOverride(nextProteinStr);
      if (nextCaloriesStr != null) setCalorieOverride(nextCaloriesStr);
    }, []),
  );

  const requestLeaveUnsaved = useCallback((action: () => void) => {
    // Refs avoid stale closures skipping the confirm and calling router.back immediately.
    if (phaseRef.current === 'result' && analysisRef.current) {
      discardActionRef.current = action;
      Keyboard.dismiss();
      setDiscardOpen(true);
      return;
    }
    action();
  }, []);

  const confirmDiscard = useCallback(() => {
    const action = discardActionRef.current;
    discardActionRef.current = null;
    setDiscardOpen(false);
    action?.();
  }, []);

  const cancelDiscard = useCallback(() => {
    discardActionRef.current = null;
    setDiscardOpen(false);
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    }
  }, []);

  const leavePressLockRef = useRef(0);
  const onLeavePress = useCallback(() => {
    const now = Date.now();
    if (now - leavePressLockRef.current < 350) return;
    leavePressLockRef.current = now;
    requestLeaveUnsaved(() => {
      if (firstScanRequired) void skipFirstScan();
      else goHome();
    });
  }, [firstScanRequired, requestLeaveUnsaved]);

  const renderHeader = (overlay = false) => (
    <View
      style={[
        styles.topBar,
        overlay && styles.topBarOverlay,
        { paddingTop: headerTop },
      ]}
      pointerEvents={overlay ? 'box-none' : 'auto'}>
      <Pressable
        onPressIn={onLeavePress}
        onPress={onLeavePress}
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
      {phase === 'result' || (demoAutoScan && phase === 'camera') ? renderHeader() : null}

      {error ? (
        <Animated.View
          entering={FadeInDown.duration(320)}
          style={[
            styles.errorBanner,
            phase === 'camera' && !demoAutoScan
              ? [styles.errorBannerOverlay, { top: headerTop + 52 }]
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
          style={[
            styles.cameraWrap,
            isWide && {
              maxWidth: Math.max(stageMaxWidth, contentMaxWidth),
              width: '100%',
              alignSelf: 'center',
            },
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          onLayout={onCameraLayout}>
          {hasCameraPermission ? (
            <CameraView
              ref={setCameraRef}
              style={styles.camera}
              facing="back"
              pictureSize={pictureSize}
              onCameraReady={() => {
                setCameraInitialized(true);
                void (async () => {
                  try {
                    const cam = cameraRef.current as CameraView & {
                      getAvailablePictureSizesAsync?: () => Promise<string[]>;
                    } | null;
                    const sizes = await cam?.getAvailablePictureSizesAsync?.();
                    if (!sizes?.length) return;
                    // Prefer ~1440–1920px long side: sharp food detail, not full 4K lag.
                    const ranked = sizes
                      .map((size) => {
                        const [a, b] = size.split('x').map((n) => Number(n));
                        const long = Math.max(a || 0, b || 0);
                        return { size, long };
                      })
                      .filter((s) => s.long > 0)
                      .sort((x, y) => {
                        const score = (long: number) =>
                          Math.abs(long - 1600) + (long > 2200 ? (long - 2200) * 0.5 : 0);
                        return score(x.long) - score(y.long);
                      });
                    if (ranked[0]?.size) setPictureSize(ranked[0].size);
                  } catch {
                    /* keep device default */
                  }
                })();
              }}
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
              viewportW={vw}
              viewportH={vh}
              scale={uiScale}
              onOutsidePress={dismissKeyboard}
            />
          ) : (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismissKeyboard}
              accessible={false}
            />
          )}

          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.flash, flashStyle]}
          />

          <Pressable
            onPressIn={onLeavePress}
            onPress={onLeavePress}
            hitSlop={12}
            style={[
              styles.iconBtn,
              styles.scanCloseBtn,
              { top: headerTop, left: edgePad, zIndex: 40 },
            ]}
            accessibilityLabel={firstScanRequired ? 'Skip for now' : 'Close'}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>

          <View
            pointerEvents="box-none"
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - topChromeH) > 1) setTopChromeH(h);
            }}
            style={[
              styles.scanChrome,
              { paddingTop: headerTop + 44 + spacing.xs, zIndex: 30 },
            ]}>
            <View style={chromeColumnStyle}>
              <View
                style={[
                  styles.scanHero,
                  {
                    paddingTop: heroPadV,
                    paddingBottom: heroPadV,
                    gap: tinyH || landscape ? 2 : 4,
                    // Lift icon/title/subtitle ~30px; keep note pill + viewfinder put.
                    marginTop: -30,
                    marginBottom: 30,
                  },
                ]}>
                {showHeroIcon ? (
                  <Ionicons
                    name="scan-outline"
                    size={Math.max(18, Math.round(22 * uiScale))}
                    color={colors.accent}
                  />
                ) : null}
                <Text
                  style={[
                    styles.scanHeroTitle,
                    { fontSize: heroTitleSize, lineHeight: displayLH(heroTitleSize) },
                  ]}>
                  SCAN MEAL
                </Text>
                {showHeroSub ? (
                  <Text
                    style={[
                      styles.scanHeroSub,
                      { fontSize: heroSubSize, lineHeight: heroSubSize + 6 },
                    ]}>
                    Scan your meal to detect protein instantly
                  </Text>
                ) : null}
              </View>

              <View
                style={[
                  styles.notePill,
                  {
                    maxWidth: notePillMax,
                    alignSelf: 'center',
                    width: '100%',
                    minHeight: tinyH ? 42 : 52,
                    paddingVertical: tinyH ? 6 : 8,
                  },
                ]}>
                <View
                  style={[
                    styles.noteIconWrap,
                    tinyH && { width: 28, height: 28, borderRadius: 14 },
                  ]}>
                  <Ionicons name="restaurant" size={tinyH ? 13 : 16} color={colors.accent} />
                </View>
                <View style={styles.noteField}>
                  <TextInput
                    style={[
                      styles.noteInput,
                      textInputWeb,
                      tinyH && { fontSize: 14, lineHeight: 18 },
                    ]}
                    value={scanNote}
                    onChangeText={setScanNote}
                    placeholder=""
                    placeholderTextColor="transparent"
                    maxLength={280}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={dismissKeyboard}
                    autoCorrect
                    autoCapitalize="sentences"
                    editable={!capturing}
                    accessibilityLabel="Optional extra info for AI"
                  />
                  {!scanNote.trim() ? (
                    <View pointerEvents="none" style={styles.notePlaceholder}>
                      <Text
                        style={[
                          styles.notePlaceholderTitle,
                          tinyH && { fontSize: 14, lineHeight: 17 },
                        ]}>
                        extra info?
                      </Text>
                      <Text
                        style={[
                          styles.notePlaceholderSub,
                          tinyH && { fontSize: 12, lineHeight: 15 },
                        ]}>
                        add it here
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={tinyH ? 16 : 18} color={colors.textTertiary} />
              </View>
            </View>
          </View>

          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - botChromeH) > 1) setBotChromeH(h);
            }}
            style={[
              styles.controls,
              {
                zIndex: 20,
                paddingBottom: Math.max(insets.bottom, spacing.md) + (tinyH ? spacing.xs : spacing.sm),
                maxWidth: stageMaxWidth,
                alignSelf: 'center',
                width: '100%',
              },
            ]}>
            <View
              style={[
                styles.shutterRow,
                {
                  paddingHorizontal: Math.max(sideGutter, spacing.md),
                  maxWidth: Math.min(stageWidth, viewfinderSize + sideGutter * 2),
                  alignSelf: 'center',
                  width: '100%',
                },
              ]}>
              <Pressable
                onPress={pickFromLibrary}
                disabled={capturing}
                accessibilityLabel="Upload from gallery"
                accessibilityRole="button"
                style={[styles.sideAction, capturing && { opacity: 0.35 }]}
                hitSlop={8}>
                <View
                  style={[
                    styles.libraryBtn,
                    { width: librarySize, height: librarySize, borderRadius: librarySize / 2 },
                  ]}>
                  <Ionicons
                    name="images-outline"
                    size={Math.max(18, Math.round(22 * uiScale))}
                    color={colors.text}
                  />
                </View>
                <Text style={styles.sideActionLabel}>GALLERY</Text>
              </Pressable>

              <Pressable
                onPress={capture}
                disabled={!cameraReady || capturing}
                accessibilityLabel="Scan meal"
                accessibilityRole="button"
                style={[styles.scanAction, (!cameraReady || capturing) && { opacity: 0.35 }]}>
                <View
                  style={[
                    styles.shutter,
                    {
                      width: shutterSize,
                      height: shutterSize,
                      borderRadius: shutterSize / 2,
                    },
                    capturing && { transform: [{ scale: 0.92 }] },
                  ]}>
                  <View
                    style={[
                      styles.shutterInner,
                      {
                        width: Math.round(shutterSize * 0.8),
                        height: Math.round(shutterSize * 0.8),
                        borderRadius: Math.round(shutterSize * 0.4),
                      },
                    ]}
                  />
                </View>
                <Text style={styles.scanActionLabel}>SCAN</Text>
              </Pressable>

              <View style={styles.sideAction}>
                <View
                  style={[
                    styles.libraryBtn,
                    {
                      opacity: 0,
                      width: librarySize,
                      height: librarySize,
                      borderRadius: librarySize / 2,
                    },
                  ]}
                />
                <Text style={[styles.sideActionLabel, { opacity: 0 }]}>SPACER</Text>
              </View>
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
        <Animated.View
          entering={FadeIn}
          style={[
            styles.analyzingWrap,
            {
              maxWidth: contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
              paddingTop: headerTop,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              paddingHorizontal: horizontalPad,
            },
          ]}>
          <Pressable
            onPressIn={onLeavePress}
            onPress={onLeavePress}
            hitSlop={12}
            style={[styles.iconBtn, styles.analyzingCloseBtn]}
            accessibilityLabel={firstScanRequired ? 'Skip for now' : 'Close'}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.analyzingHero}>
            <Ionicons
              name="scan-outline"
              size={Math.round((isTablet || isDesktop ? 36 : 32) * Math.min(uiScale, 1.06))}
              color={colors.accent}
            />
            <Text style={styles.analyzingEyebrow}>ANALYZING</Text>
            <Text
              style={[
                styles.analyzingHeroTitle,
                {
                  fontSize: Math.round((isTablet ? 34 : tinyH ? 26 : 30) * Math.min(uiScale, 1)),
                  lineHeight: displayLH(
                    Math.round((isTablet ? 34 : tinyH ? 26 : 30) * Math.min(uiScale, 1)),
                  ),
                },
              ]}>
              Analyzing your meal
            </Text>
            <Text
              style={[
                styles.analyzingHeroSub,
                { fontSize: Math.round((isTablet ? 16 : 14) * Math.min(uiScale, 1)), maxWidth: isTablet ? 420 : 300 },
              ]}>
              Our AI is identifying ingredients and estimating portions
            </Text>
          </View>

          <View style={styles.analyzingBody}>
            <View
              style={[
                styles.analyzingImageWrap,
                {
                  maxWidth: Math.min(stageMaxWidth, isTablet || isDesktop ? 380 : 320),
                  width: '100%',
                },
              ]}>
              {displayUri ? (
                <View style={styles.analyzingPreviewShell}>
                  <MealPhotoPreview
                    uri={displayUri}
                    square={previewSquare}
                    bordered={false}
                    borderRadius={radius.md}
                    maxHeightRatio={tinyH ? 0.32 : compactH ? 0.36 : isTablet ? 0.38 : 0.4}
                  />
                  <AnalyzingCornerBrackets scale={uiScale} />
                  <ScanSweep />
                </View>
              ) : (
                <View style={styles.analyzingPlaceholder} />
              )}
            </View>

            {scanNote.trim() ? (
              <View
                style={[
                  styles.analyzingNotePill,
                  {
                    maxWidth: Math.min(stageMaxWidth, isTablet || isDesktop ? 380 : 320),
                  },
                ]}
                accessibilityLabel={`Your note: ${scanNote.trim()}`}>
                <View style={styles.analyzingNoteIcon}>
                  <Ionicons name="create-outline" size={13} color={colors.accent} />
                </View>
                <View style={styles.analyzingNoteCopy}>
                  <Text style={styles.analyzingNoteLabel}>Your note</Text>
                  <Text style={styles.analyzingNoteText} numberOfLines={2}>
                    {scanNote.trim()}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.analyzingFooter}>
            <Text style={styles.analyzingStatus}>Analyzing...</Text>
            <AnalyzingProgressBar progress={analyzeProgress} />
          </View>
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
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}>
          {displayUri ? (
            <Animated.View
              entering={FadeIn}
              style={[
                styles.resultImageWrap,
                {
                  maxWidth: Math.min(
                    stageMaxWidth,
                    isTablet || isDesktop ? 480 : 420,
                  ),
                },
              ]}>
              <View style={styles.resultPhotoShell}>
                <MealPhotoPreview
                  uri={displayUri}
                  square={previewSquare}
                  bordered={false}
                  borderRadius={radius.md}
                  maxHeightRatio={
                    tinyH ? 0.34 : compactH ? 0.38 : isTablet || isDesktop ? 0.4 : 0.42
                  }
                />
                <View style={styles.confidenceBadge} pointerEvents="none">
                  <Ionicons name="star" size={12} color={colors.accent} />
                  <Text style={styles.confidenceBadgeText}>
                    <Text style={styles.confidenceLevel}>
                      {(analysis.confidence || 'medium').toUpperCase()}
                    </Text>
                    {' CONFIDENCE'}
                  </Text>
                </View>
              </View>
            </Animated.View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.resultTitleBlock}>
            <View style={styles.foodNameRow}>
              <TextInput
                ref={foodNameRef}
                style={[styles.foodName, styles.foodNameInput, textInputWeb, { flex: 1 }]}
                value={analysis.food_name}
                onChangeText={(t) =>
                  setAnalysis((prev) => (prev ? { ...prev, food_name: t } : prev))
                }
                placeholder="Meal name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="sentences"
                autoCorrect
                maxLength={80}
                returnKeyType="done"
                accessibilityLabel="Edit food name"
              />
              <Pressable
                onPress={() => foodNameRef.current?.focus()}
                hitSlop={10}
                accessibilityLabel="Edit food name"
                style={styles.foodNameEditBtn}>
                <Ionicons name="pencil" size={18} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.metaText}>{formatScanMeta(scannedAt)}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.nutritionCard}>
            <View style={styles.nutritionCol}>
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
                tap to adjust • max{' '}
                {maxAllowedOverride(analysis.total_protein_g, PROTEIN_OVERRIDE_BUFFER_G)}g
              </Text>
            </View>
            <View style={styles.nutritionDivider} />
            <View style={styles.nutritionCol}>
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
                tap to adjust • max{' '}
                {maxAllowedOverride(analysis.calories, CALORIE_OVERRIDE_BUFFER)}
              </Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(400)}>
            <View style={styles.ingredientsCard}>
              <View style={styles.ingredientsHeader}>
                <Text style={styles.ingredientsTitle}>
                  INGREDIENTS ({analysis.items.length})
                </Text>
              </View>

              {analysis.items.map((item, i) => {
                const itemCalories =
                  typeof item.calories_g === 'number' && item.calories_g >= 0
                    ? item.calories_g
                    : analysis.total_protein_g > 0
                      ? Math.round(
                          analysis.calories * (item.protein_g / analysis.total_protein_g),
                        )
                      : Math.round(analysis.calories / Math.max(analysis.items.length, 1));
                return (
                  <Pressable
                    key={`${item.name}-${i}`}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      const q = new URLSearchParams({
                        index: String(i),
                        name: item.name,
                        portion: item.portion || '1 serving',
                        protein: String(item.protein_g),
                        calories: String(itemCalories),
                      });
                      if (item.estimated_grams != null) {
                        q.set('grams', String(item.estimated_grams));
                      }
                      router.push(`/scan-adjust?${q.toString()}` as never);
                    }}
                    style={[styles.ingredientRow, i > 0 && styles.ingredientRowBorder]}
                    accessibilityRole="button"
                    accessibilityLabel={`Adjust ${item.name}`}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemPortion} numberOfLines={1}>
                        {item.estimated_grams ? `~${item.estimated_grams}g • ` : ''}
                        {item.portion}
                      </Text>
                    </View>
                    <Text style={styles.itemProtein}>
                      {item.protein_g < 10
                        ? item.protein_g.toFixed(1)
                        : Math.round(item.protein_g)}
                      g
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </Pressable>
                );
              })}

              {analysis.notes ? <Text style={styles.notesInCard}>{analysis.notes}</Text> : null}
            </View>

            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.push('/scan-ingredient' as never);
              }}
              style={({ pressed }) => [
                styles.addIngredientRow,
                pressableWeb,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add ingredient">
              <View style={styles.addIngredientIcon}>
                <Ionicons name="add" size={18} color={colors.accent} />
              </View>
              <Text style={styles.addIngredientText}>Add ingredient</Text>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(320)} style={styles.resultActions}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.logItBtn, saving && { opacity: 0.5 }]}
              accessibilityRole="button"
              accessibilityLabel="Log it">
              {saving ? (
                <Text style={styles.logItBtnText}>Saving…</Text>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color={colors.onAccent} />
                  <Text style={styles.logItBtnText}>Log it</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => requestLeaveUnsaved(resetToCamera)}
              style={styles.retakeBtn}
              accessibilityRole="button"
              accessibilityLabel="Retake Scan">
              <Ionicons name="refresh" size={18} color={colors.text} />
              <Text style={styles.retakeBtnText}>Retake Scan</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      )}

      {discardOpen ? (
        <View
          style={styles.discardRoot}
          accessibilityViewIsModal
          importantForAccessibility="yes">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={styles.discardBackdrop}
            onPress={cancelDiscard}
          />
          <View style={styles.discardCardWrap}>
            <GlassPanel emphasized style={styles.discardCard}>
              <View style={styles.discardSheen} pointerEvents="none" />
              <Text style={styles.discardTitle}>Save this scan?</Text>
              <Text style={styles.discardBody}>
                Are you sure you do not want to save this? It will be lost.
              </Text>
              <View style={styles.discardActions}>
                <Button title="Keep editing" onPress={cancelDiscard} />
                <Pressable
                  onPress={confirmDiscard}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Discard scan"
                  style={({ pressed }) => [
                    styles.discardSecondary,
                    pressed && styles.discardSecondaryPressed,
                  ]}>
                  <Text style={styles.discardSecondaryLabel}>Discard</Text>
                </Pressable>
              </View>
            </GlassPanel>
          </View>
        </View>
      ) : null}

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
              food: analysis?.food_name?.trim() || undefined,
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
  scanCloseBtn: {
    position: 'absolute',
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
  cameraWrap: { flex: 1, backgroundColor: colors.bg },
  scanChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scanTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  scanHero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xs,
    gap: 4,
  },
  scanHeroTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: colors.text,
    letterSpacing: 1.2,
  },
  scanHeroSub: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(246,244,248,0.78)',
    textAlign: 'center',
  },
  notePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 58,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(14px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
        } as object)
      : {}),
  },
  noteIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(120, 52, 38, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.4)',
  },
  noteField: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    justifyContent: 'center',
    minHeight: 40,
  },
  noteInput: {
    padding: 0,
    margin: 0,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
    ...(Platform.OS === 'web'
      ? ({
          backgroundColor: 'transparent',
          outlineStyle: 'none',
          colorScheme: 'dark',
          WebkitAppearance: 'none',
          appearance: 'none',
        } as object)
      : { backgroundColor: 'transparent' }),
  },
  notePlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  notePlaceholderTitle: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    lineHeight: 20,
    color: 'rgba(246,244,248,0.78)',
  },
  notePlaceholderSub: {
    marginTop: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(246,244,248,0.52)',
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
    backgroundColor: 'rgba(12, 11, 16, 0.62)',
  },
  finderGlass: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finderGuide: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  finderGuideTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 15,
    letterSpacing: 1.4,
    color: colors.text,
  },
  finderGuideSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: 'rgba(246,244,248,0.72)',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.accent,
  },
  tl: { top: 10, left: 10, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  tr: { top: 10, right: 10, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  bl: { bottom: 10, left: 10, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  br: { bottom: 10, right: 10, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.sm,
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.xl,
  },
  sideAction: {
    width: 72,
    alignItems: 'center',
    gap: 8,
  },
  sideActionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.text,
  },
  libraryBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 11, 16, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  scanAction: {
    alignItems: 'center',
    gap: 8,
  },
  scanActionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.8,
    color: colors.accent,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent,
  },
  analyzingWrap: {
    flex: 1,
    alignItems: 'center',
  },
  analyzingCloseBtn: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    zIndex: 2,
  },
  analyzingHero: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analyzingEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2.2,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  analyzingHeroTitle: {
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  analyzingHeroSub: {
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  analyzingBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.sm,
  },
  analyzingImageWrap: {
    width: '100%',
    maxWidth: 360,
  },
  analyzingPreviewShell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
  },
  analyzingPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  analyzingNotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(12px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.15)',
        } as object)
      : {}),
  },
  analyzingNoteIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,122,89,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,122,89,0.28)',
  },
  analyzingNoteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  analyzingNoteLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.textTertiary,
    textTransform: 'uppercase',
  },
  analyzingNoteText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.85,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  analyzingStatus: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  analyzingFooter: {
    width: '100%',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm,
    // Lift status + progress bar ~75px from the bottom edge
    marginBottom: 75,
  },
  analyzeProgressTrack: {
    width: '100%',
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  analyzeProgressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  resultScroll: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  resultImageWrap: {
    width: '100%',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  resultPhotoShell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.md,
  },
  confidenceBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(12, 11, 16, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  confidenceBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.text,
  },
  confidenceLevel: {
    color: colors.accent,
    fontFamily: fonts.mono,
  },
  resultTitleBlock: {
    marginBottom: spacing.md,
  },
  foodNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  foodName: {
    fontFamily: fonts.displayHeavy,
    fontSize: 28,
    lineHeight: displayLH(28),
    color: colors.text,
    letterSpacing: -0.8,
  },
  foodNameInput: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    margin: 0,
    borderBottomWidth: 0,
  },
  foodNameEditBtn: {
    padding: 4,
  },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
  },
  nutritionCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  nutritionCol: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  nutritionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairlineBright,
    alignSelf: 'stretch',
  },
  ingredientsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
  },
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  ingredientsTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.textSecondary,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: spacing.sm,
  },
  ingredientRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  addIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,138,61,0.28)',
  },
  addIngredientIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,138,61,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,138,61,0.4)',
  },
  addIngredientText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.accent,
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
  itemName: { fontFamily: fonts.displayMedium, fontSize: 15, color: colors.text },
  itemPortion: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  itemRight: { alignItems: 'flex-end' },
  itemProtein: {
    fontFamily: fonts.display,
    fontSize: 15,
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
  notesInCard: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textTertiary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  totalBlock: { alignItems: 'flex-start' },
  totalLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.textTertiary,
  },
  totalInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 2,
  },
  totalInput: {
    fontSize: 40,
    lineHeight: displayLH(40),
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 28,
    letterSpacing: -1.2,
  },
  totalUnit: {
    fontSize: 18,
    lineHeight: displayLH(18),
    fontFamily: fonts.displayHeavy,
    color: colors.accent,
    marginBottom: 8,
    marginLeft: 1,
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
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  resultActions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  logItBtn: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logItBtnText: {
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    color: colors.onAccent,
    letterSpacing: 0.2,
  },
  retakeBtn: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.hairlineBright,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retakeBtnText: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    color: colors.text,
    letterSpacing: 0.2,
  },
  discardRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  discardBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 5, 10, 0.55)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
        } as object)
      : null),
  },
  discardCardWrap: {
    width: '100%',
    maxWidth: 380,
    ...shadowCard,
    boxShadow: '0 28px 64px rgba(0,0,0,0.55), 0 0 48px rgba(255,122,89,0.12)',
    elevation: 20,
  },
  discardCard: {
    position: 'relative',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(22, 20, 30, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  discardSheen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  discardTitle: {
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    lineHeight: displayLH(22),
    color: colors.text,
    letterSpacing: -0.2,
    marginBottom: spacing.sm,
  },
  discardBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  discardActions: {
    gap: spacing.xs,
  },
  discardSecondary: {
    ...pressableWeb,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.button,
  },
  discardSecondaryPressed: {
    opacity: 0.65,
  },
  discardSecondaryLabel: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    letterSpacing: 0.2,
    color: colors.textTertiary,
  },
});
