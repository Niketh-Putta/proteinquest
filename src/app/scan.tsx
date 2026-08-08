import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    InteractionManager,
    Keyboard,
    Linking,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
    type LayoutChangeEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
import { ModalMotionLayer } from '@/components/ModalMotionLayer';
import { MealPhotoPreview } from '@/components/MealPhotoPreview';
import { trackEvent } from '@/lib/analytics';
import {
    analyzeFoodPhoto,
    countLifetimeMeals,
    countTodayPhotoScans,
    deleteLog,
    fetchProfile,
    fetchTodayMealSummary,
    getFoodPhotoUrl,
    insertLog,
    recordPhotoScan,
    updateLogImagePath,
    uploadFoodPhoto,
} from '@/lib/api';
import {
    XP_GOAL_BONUS,
    XP_PER_GRAM,
    applyLogToCharacter,
    displayDragonId,
    displayDragonName,
    isDailyDragonLockedForToday,
} from '@/lib/character';
import { clearNeedsFirstScan, needsFirstScan } from '@/lib/first-scan';
import { useLayout } from '@/lib/layout';
import { useSpecialDeviceLayout } from '@/lib/special-device';
import { rememberLocalMealPhoto } from '@/lib/local-meal-photo';
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
    parseNutritionNumber,
    sanitizeNutritionDraft,
} from '@/lib/parse-nutrition-number';
import {
    canScan,
    hasUnlimitedScans,
    isScanLimitMessage,
    remainingFreeScans,
} from '@/lib/paywall-gate';
import { pickLibraryImage } from '@/lib/pick-library-image';
import {
  resolveCameraPermissionUi,
  shouldAutoRequestCameraPermission,
  shouldRequestCameraPermission,
} from '@/lib/camera-permission';
import { todayISODate } from '@/lib/protein';
import { getRetention, markCareDay, rollLootDrop } from '@/lib/retention';
import {
    consumePendingIngredientEdit,
    registerIngredientEditApplier,
    type ScanIngredientEdit,
} from '@/lib/scan-ingredient-edit';
import { prefetchRoute, runAfterNav } from '@/lib/navigate-responsive';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import { bindUnmirroredWebCameraPreview } from '@/lib/web-camera-preview';
import {
    colors,
    displayLH,
    fonts,
    layout,
    noTextCaret,
    pressableWeb,
    radius,
    shadowCard,
    spacing,
    textInputWeb,
} from '@/theme';

type Phase = 'camera' | 'analyzing' | 'result';
type ScanMode = 'photo' | 'text';

const SCAN_MODE_OPTIONS: {
  value: ScanMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  labelNarrow: string;
  a11y: string;
}[] = [
  { value: 'photo', icon: 'camera', label: 'PHOTO', labelNarrow: 'PHOTO', a11y: 'Photo' },
  {
    value: 'text',
    icon: 'text-outline',
    label: 'TEXT',
    labelNarrow: 'TEXT',
    a11y: 'Text',
  },
];

const DEMO_AUTO_SCAN_KEY = 'pq_demo_auto_scan';

/** Photo AI failures must never surface while in text mode. */
function isFoodAnalyzeError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('does not contain food') ||
    m.includes("doesn't look like food") ||
    m.includes('doesnt look like food') ||
    m.includes('point the camera at your meal') ||
    m.includes('clearer description or photo') ||
    m.includes('analyzing your meal') ||
    (m.includes('food') && (m.includes('not') || m.includes("doesn't") || m.includes('doesnt')))
  );
}
/** App icon mark (coral dragon + bowl). Pair with ProteinQuest wordmark text. */
const BRAND_MARK = require('@/assets/images/icon.png');
const BRAND_WORD = 'ProteinQuest';
/** Outfit_600SemiBold: slightly high so we shrink early and never clip. */
const BRAND_CHAR_EM = 0.62;
const BRAND_LETTER_SPACING = 0.2;

/** Estimated rendered width of the ProteinQuest wordmark at a font size. */
function brandWordmarkWidth(fontSize: number, letterSpacing = BRAND_LETTER_SPACING): number {
  const n = BRAND_WORD.length;
  return fontSize * BRAND_CHAR_EM * n + letterSpacing * Math.max(0, n - 1);
}

const IS_NATIVE = Platform.OS !== 'web';
/** Reanimated entering + photo under adjust jetsam-kills iOS on ingredient tap. */
const Enter = IS_NATIVE ? View : Animated.View;
const enterProps = (delay = 0, duration = 400) =>
  IS_NATIVE ? {} : { entering: FadeInDown.delay(delay).duration(duration) };
const enterFade = () => (IS_NATIVE ? {} : { entering: FadeIn });

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

function ScanModeToggle({
  value,
  onChange,
  disabled,
  itemH,
  iconSize,
  tinyH,
  compactH,
}: {
  value: ScanMode;
  onChange: (mode: ScanMode) => void;
  disabled?: boolean;
  itemH: number;
  iconSize: number;
  tinyH: boolean;
  compactH: boolean;
}) {
  const { width: winW } = useWindowDimensions();
  /** Width + height tiers from parent (tinyH/compactH/uiScale). */
  const veryNarrow = winW < 340;
  const narrow = winW < 380 || tinyH;
  const wide = winW >= 430 && !tinyH && !compactH;
  const trackPad = narrow ? 3 : wide ? 5 : 4;
  const itemPadH = veryNarrow ? 2 : narrow ? 4 : wide ? 8 : 5;
  const gap = narrow ? 2 : wide ? 4 : 3;
  const labelSize = veryNarrow ? 8 : narrow ? 9 : compactH ? 10 : 11;
  const itemGap = veryNarrow ? 3 : narrow ? 4 : 5;
  const inactiveColor = 'rgba(210, 205, 215, 0.72)';

  // Width comes from parent inset (= finder width). Never let labels expand past that.
  return (
    <GlassPanel style={[styles.modeToggle, { padding: trackPad, gap }]}>
      {SCAN_MODE_OPTIONS.map((opt) => {
        const selected = value === opt.value;
        const tint = selected ? colors.accent : inactiveColor;
        const label = veryNarrow ? opt.labelNarrow : opt.label;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Scan mode ${opt.a11y}`}
            style={[
              styles.modeToggleItem,
              {
                height: itemH,
                paddingHorizontal: itemPadH,
                gap: itemGap,
              },
              selected && styles.modeToggleItemOn,
              pressableWeb,
            ]}>
            <Ionicons name={opt.icon} size={iconSize} color={tint} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[
                styles.modeToggleLabel,
                {
                  fontSize: labelSize,
                  letterSpacing: veryNarrow ? 0.2 : narrow ? 0.35 : 0.55,
                  color: tint,
                },
              ]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </GlassPanel>
  );
}

function ScanViewfinder({
  width,
  height,
  top,
  left,
  viewportW,
  viewportH,
  scale = 1,
}: {
  width: number;
  height: number;
  top: number;
  left: number;
  viewportW: number;
  viewportH: number;
  scale?: number;
}) {
  const shortSide = Math.min(width, height);
  /** Mild rectangle radius so brackets + dim hole stay aligned. */
  const radius = Math.max(10, Math.min(16, Math.round(shortSide * 0.045)));
  const corner = Math.max(18, Math.round(28 * scale));
  const inset = Math.max(8, Math.round(10 * scale));
  const iconSize = Math.max(22, Math.round(36 * scale));
  const titleSize = Math.max(12, Math.round(15 * scale));
  const subSize = Math.max(11, Math.round(13 * scale));
  const showGuide = width >= 160 && height >= 88;
  const maskId = 'scan-finder-hole';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={viewportW} height={viewportH} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id={maskId}>
              <Rect x={0} y={0} width={viewportW} height={viewportH} fill="#fff" />
              <Rect
                x={left}
                y={top}
                width={width}
                height={height}
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
      </View>
      <View
        style={[
          styles.finderGlass,
          {
            top,
            left,
            width,
            height,
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
            <Text style={[styles.finderGuideTitle, { fontSize: titleSize }]}>FRAME YOUR MEAL</Text>
            <Text style={[styles.finderGuideSub, { fontSize: subSize }]}>
              Make sure it's well lit
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function ScanScreen() {
  const { session, profile, saveProfile } = useSession();
  const {
    horizontalPad,
    contentWidth,
    contentMaxWidth,
    formMaxWidth,
    formWidth,
    isWide,
    isDesktop,
    isTablet,
  } = useLayout();
  const special = useSpecialDeviceLayout();
  /** Always 1 on normal phones — special fold/split/cover only. */
  const ss = special.specialScale;
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
  const [scanMode, setScanMode] = useState<ScanMode>('photo');

  /** Keep chrome below Dynamic Island / front camera on all phones. */
  const vw = cameraViewport.width;
  const vh = cameraViewport.height;
  const shortSide = Math.min(vw, vh);
  const landscape = vw > vh * 1.05;
  const tinyH = vh < 620 || (landscape && vh < 420);
  const compactH = !tinyH && (vh < 740 || (landscape && vh < 520));
  const tallH = vh >= 900 && !landscape;
  /** Scale UI from a phone reference; dampen on huge tablets so chrome doesn't balloon. */
  const uiScale =
    Math.min(
      isDesktop ? 1.08 : isTablet ? 1.05 : 1.12,
      Math.max(0.76, Math.min(shortSide / 390, vh / (landscape ? 420 : 780))),
    ) * ss;
  /** Vertical rhythm: tighter on short screens, airier on tall phones (not huge voids). */
  const stackGapMdRaw = tinyH || landscape ? 8 : compactH ? 12 : tallH ? 18 : 14;
  const stackGapLgRaw = tinyH || landscape ? 10 : compactH ? 14 : tallH ? 22 : 18;
  const stackGapMd = special.isSpecial ? Math.max(2, Math.round(stackGapMdRaw * ss)) : stackGapMdRaw;
  const stackGapLg = special.isSpecial ? Math.max(2, Math.round(stackGapLgRaw * ss)) : stackGapLgRaw;
  const heroPadVRaw = tinyH || landscape ? 2 : compactH ? 4 : tallH ? spacing.md : spacing.sm;
  const brandDropRaw = tinyH || landscape ? 4 : compactH ? 10 : tallH ? 18 : 14;
  const heroPadV = special.isSpecial ? Math.max(0, Math.round(heroPadVRaw * ss)) : heroPadVRaw;
  const brandDrop = special.isSpecial ? Math.max(0, Math.round(brandDropRaw * ss)) : brandDropRaw;
  const heroBelow = stackGapMd;
  const headerTop =
    Math.max(insets.top, Platform.OS === 'web' ? 20 : 12) + (tinyH ? spacing.xs : spacing.sm);
  const edgePad = Math.max(insets.left, spacing.md);
  /** Match result/meal column gutters; fold leftover safe-area when form is full-bleed. */
  const formSideInset = Math.max(0, (screenW - formWidth) / 2);
  const resultPadLeft = Math.max(horizontalPad, insets.left - formSideInset);
  const resultPadRight = Math.max(horizontalPad, insets.right - formSideInset);
  const veryNarrow = screenW < 340;
  /** Keep brand clear of the absolute close button on both edges. */
  const brandSideClear = edgePad + 44 + (veryNarrow ? 4 : 8);
  const brandGap = veryNarrow || tinyH ? 6 : 8;
  /** Stage-capped row width so the lockup fits beside the close control. */
  const brandStageCap = isDesktop ? 520 : isTablet ? 460 : landscape ? 520 : 420;
  const brandRowMaxW = Math.max(96, Math.min(screenW, brandStageCap) - brandSideClear * 2);
  const brandTitleMax = Math.round(
    (isTablet || isDesktop ? 34 : tallH ? 30 : compactH ? 26 : tinyH || veryNarrow ? 22 : 28) *
      Math.min(uiScale, 1.08),
  );
  const brandMarkMax = Math.round(
    (isTablet || isDesktop ? 56 : tallH ? 48 : compactH ? 40 : tinyH || veryNarrow ? 30 : 44) *
      Math.min(uiScale, 1.08),
  );
  const brandTitleFloor = 13;
  const brandMarkFloor = 20;
  /** Scale title (then mark) so full "ProteinQuest" always fits; never ellipsize. */
  let brandMarkSize = brandMarkMax;
  let brandTitleSize = brandTitleMax;
  const brandNeeded = (mark: number, title: number) =>
    mark + brandGap + brandWordmarkWidth(title);
  if (brandNeeded(brandMarkSize, brandTitleSize) > brandRowMaxW) {
    const textBudget = brandRowMaxW - brandMarkSize - brandGap;
    brandTitleSize = Math.max(
      brandTitleFloor,
      Math.floor(
        (textBudget - BRAND_LETTER_SPACING * (BRAND_WORD.length - 1)) /
          (BRAND_CHAR_EM * BRAND_WORD.length),
      ),
    );
  }
  if (brandNeeded(brandMarkSize, brandTitleSize) > brandRowMaxW) {
    brandMarkSize = Math.max(
      brandMarkFloor,
      Math.floor(brandRowMaxW - brandGap - brandWordmarkWidth(brandTitleSize)),
    );
  }
  if (brandNeeded(brandMarkSize, brandTitleSize) > brandRowMaxW) {
    brandMarkSize = brandMarkFloor;
    const textBudget = Math.max(64, brandRowMaxW - brandMarkSize - brandGap);
    brandTitleSize = Math.max(
      11,
      Math.floor(
        (textBudget - BRAND_LETTER_SPACING * (BRAND_WORD.length - 1)) /
          (BRAND_CHAR_EM * BRAND_WORD.length),
      ),
    );
  }
  const showBrandMark = true;
  const titleBlockEst = Math.round(
    (Math.max(showBrandMark ? brandMarkSize : 0, brandTitleSize) +
      heroPadV * 2 +
      brandDrop +
      heroBelow) *
      Math.min(uiScale, 1),
  );
  const shutterSize = Math.round(
    (tinyH ? 56 : compactH ? 68 : isTablet || isDesktop ? 82 : 76) * Math.min(uiScale, 1.06),
  );
  /** Side controls ~68% of shutter so the triad reads balanced, not corner-orphaned. */
  const librarySize = Math.round(
    Math.max(
      tinyH ? 42 : 46,
      Math.min(
        isTablet || isDesktop ? 58 : 54,
        Math.round(shutterSize * (tinyH ? 0.72 : 0.68)),
      ),
    ),
  );
  const libraryIconSize = Math.max(18, Math.round(librarySize * 0.42));
  const controlLabelH = tinyH ? 12 : 14;
  const controlActionGap = tinyH ? 5 : 6;
  const modeToggleH = Math.round((tinyH ? 36 : compactH ? 42 : 48) * Math.min(uiScale, 1));
  const modeToggleIconSize = Math.round((tinyH ? 12 : compactH ? 14 : 16) * Math.min(uiScale, 1));
  const controlsGap = tinyH || landscape ? 4 : compactH ? 6 : 10;
  /** TEXT: lift Continue; scale down on short phones so chrome stays clear of the finder. */
  const textContinueLift =
    scanMode === 'text' ? (tinyH || landscape ? 12 : compactH ? 28 : 50) : 0;
  const controlsPadBottom =
    Math.max(insets.bottom, tinyH ? spacing.sm : spacing.md) +
    (tinyH ? 2 : spacing.xs) +
    textContinueLift;
  /** Decorative lift of mode toggle above shutter; capped so bottom chrome never starves the finder. */
  const rawToggleGap = tinyH || landscape ? 22 : compactH ? 40 : 72;
  const controlsCoreH =
    modeToggleH +
    shutterSize +
    controlActionGap +
    controlLabelH +
    (firstScanRequired ? 32 : 0) +
    controlsPadBottom +
    spacing.xs;
  const maxBotChrome = Math.round(vh * (tinyH || landscape ? 0.36 : compactH ? 0.4 : 0.42));
  const modeToggleToShutterGap = Math.max(
    tinyH || landscape ? 10 : 14,
    Math.min(rawToggleGap, maxBotChrome - controlsCoreH),
  );
  const controlsChromeEst = controlsCoreH + modeToggleToShutterGap;
  const headerChromeEst = headerTop + 44 + spacing.sm + brandDrop + titleBlockEst;
  /** Phone column stays app-like; tablet/desktop keep a focused scan stage. */
  const stageMaxWidth = isDesktop ? 520 : isTablet ? 460 : Math.min(contentMaxWidth, landscape ? 520 : 420);
  const stageWidth = Math.min(vw, stageMaxWidth);
  const sideGutter = Math.max(
    tinyH ? 10 : compactH ? 14 : 16,
    Math.round((isTablet || isDesktop ? 28 : 20) * Math.min(uiScale, 1)),
  );
  const finderCap = landscape
    ? Math.min(260, vh * 0.5)
    : isDesktop
      ? 360
      : isTablet
        ? 320
        : Math.min(tallH ? 340 : compactH ? 300 : 320, shortSide - sideGutter * 2);
  const topReserve = topChromeH > 0 ? topChromeH : headerChromeEst;
  const botReserve = botChromeH > 0 ? botChromeH : controlsChromeEst;
  /** Gap between top chrome and finder; between finder and bottom controls. */
  const chromeGap = stackGapLg;
  const bottomGap = tinyH || landscape ? stackGapMd : tallH ? stackGapLg + 4 : stackGapLg;
  const availableForFinder = Math.max(
    tinyH ? 112 : 128,
    vh -
      topReserve -
      botReserve -
      chromeGap -
      bottomGap +
      (special.isSpecial ? special.specialGapCut * 2 : 0),
  );
  const viewfinderSize = Math.max(
    special.isUltraCompact ? 96 : tinyH ? 112 : 128,
    Math.min(stageWidth - sideGutter * 2, availableForFinder, finderCap),
  );
  /**
   * Shared scan frame width: photo square and mode toggle
   * all use this exact width so left/right edges always line up.
   */
  const scanFrameWidth = viewfinderSize;
  const finderW = scanFrameWidth;
  const finderH = viewfinderSize;
  /** Prefer optical center; clamp so header + shutter never collide with the finder. */
  const idealTop = (vh - finderH) / 2 - (landscape ? 0 : Math.min(8, vh * 0.008));
  const minTop = topReserve + chromeGap;
  const maxTop = Math.max(minTop, vh - botReserve - bottomGap - finderH);
  const viewfinderTop = Math.min(maxTop, Math.max(minTop, idealTop));
  /** Single horizontal box for finder + mode toggle (same left edge and width). */
  const scanFrameLeft = (vw - scanFrameWidth) / 2;
  const scanFrameColumnStyle = {
    width: scanFrameWidth,
    marginLeft: scanFrameLeft,
    alignSelf: 'flex-start' as const,
  };
  const chromeColumnStyle = {
    maxWidth: stageMaxWidth,
    width: '100%' as const,
    alignSelf: 'center' as const,
  };
  /** Shutter triad: wider than finder for breathing room; still stage-centered. */
  const shutterRowLayout = {
    width: stageWidth,
    maxWidth: '100%' as const,
    alignSelf: 'center' as const,
    paddingHorizontal: Math.max(tinyH ? 8 : 10, sideGutter - 2),
  };
  const renderSideSlotMirror = () => (
    <View
      style={[styles.sideAction, { gap: controlActionGap }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
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
      <Text style={[styles.sideActionLabel, { height: controlLabelH, lineHeight: controlLabelH, opacity: 0 }]}>
        GALLERY
      </Text>
    </View>
  );
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [requestingCameraPermission, setRequestingCameraPermission] = useState(false);
  const [cameraPermissionTimedOut, setCameraPermissionTimedOut] = useState(false);
  const cameraPermissionRequestRef = useRef<Promise<unknown> | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const cameraWrapRef = useRef<View>(null);
  /** Synchronous lock so rapid taps can't launch parallel capture/library flows. */
  const busyRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('camera');
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [capturing, setCapturing] = useState(false);
  /** Unmount CameraView while the photo picker is open (memory + crash avoidance). */
  const [libraryPicking, setLibraryPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  /** Unmount meal photo while adjust/add is open so iOS does not jetsam. */
  const [screenFocused, setScreenFocused] = useState(true);
  /** Square frame only for live camera viewfinder crops — library keeps full aspect. */
  const [previewSquare, setPreviewSquare] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [proteinOverride, setProteinOverride] = useState('');
  const [calorieOverride, setCalorieOverride] = useState('');
  /** True when confirm/log was opened from "add in text" (manual empty meal). */
  const [manualEntry, setManualEntry] = useState(false);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const scanModeRef = useRef<ScanMode>(scanMode);
  scanModeRef.current = scanMode;
  const foodNameRef = useRef<TextInput>(null);
  const proteinInputRef = useRef<TextInput>(null);
  const calorieInputRef = useRef<TextInput>(null);
  const dismissMealKeyboard = useCallback(() => {
    foodNameRef.current?.blur();
    proteinInputRef.current?.blur();
    calorieInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);
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
  /** Real pipeline stage floors for the analyzing bar (not fake-only crawl). */
  const analyzeStageRef = useRef<'prep' | 'ready' | 'request' | 'done'>('prep');
  const [saving, setSaving] = useState(false);
  const [scansLeft, setScansLeft] = useState<number | null>(null);
  const [celebration, setCelebration] = useState<{
    evolved: boolean;
    leveledUp: boolean;
    goalJustHit: boolean;
    xpGained: number;
    perkUnlocked: string | null;
    levelBefore: number;
    levelAfter: number;
    previousStageIndex?: number;
    proteinG: number;
    foodName?: string;
    lootDropped: boolean;
    streakFreezeUsed: boolean;
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

  const ensureCameraPermission = useCallback(
    async (opts?: { force?: boolean }) => {
      if (demoAutoScan) return;
      // Refresh status first so we never show "denied" before a real OS answer.
      const current = (getPermission ? await getPermission() : null) ?? permission;
      if (!current) return;
      if (opts?.force) {
        if (!shouldRequestCameraPermission(current)) return;
      } else if (!shouldAutoRequestCameraPermission(current)) {
        return;
      }
      if (cameraPermissionRequestRef.current) {
        await cameraPermissionRequestRef.current;
        return;
      }
      setRequestingCameraPermission(true);
      const pending = requestPermission().finally(() => {
        cameraPermissionRequestRef.current = null;
        setRequestingCameraPermission(false);
      });
      cameraPermissionRequestRef.current = pending;
      await pending;
    },
    [demoAutoScan, getPermission, permission, requestPermission],
  );

  useEffect(() => {
    void ensureCameraPermission();
  }, [ensureCameraPermission]);

  useFocusEffect(
    useCallback(() => {
      void ensureCameraPermission();
    }, [ensureCameraPermission]),
  );

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
    !!profile && !hasUnlimitedScans(profile);

  const openPaywallForLimit = useCallback(() => {
    setError(null);
    setPhase('camera');
    router.push('/paywall');
  }, []);

  /** Refresh the free-scan pill only — never auto-open paywall on focus (dismiss must stick). */
  useFocusEffect(
    useCallback(() => {
      // Route prefetch only — full catalog warm freezes Android taps.
      prefetchRoute(() => import('@/app/scan-ingredient'));
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
      analyzeStageRef.current = 'prep';
      return;
    }
    analyzeDoneRef.current = false;
    const stageFloor = (stage: typeof analyzeStageRef.current) =>
      stage === 'ready' ? 0.38 : stage === 'request' ? 0.55 : stage === 'done' ? 1 : 0.15;
    setAnalyzeProgress(stageFloor(analyzeStageRef.current));
    const startedAt = Date.now();
    const tick = () => {
      if (analyzeDoneRef.current) return;
      const floor = stageFloor(analyzeStageRef.current);
      const elapsed = Date.now() - startedAt;
      // Light crawl above the real stage floor so the bar never feels stuck.
      const timeBoost = 0.18 * (1 - Math.exp(-elapsed / 2000));
      setAnalyzeProgress(Math.min(0.92, floor + timeBoost));
    };
    tick();
    const t = setInterval(tick, Platform.OS === 'android' ? 250 : 80);
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
  }, [cameraViewport.width, cameraViewport.height, scanMode]);

  async function capture() {
    // Never take / analyze photos from text mode.
    if (scanModeRef.current !== 'photo') return;
    // Synchronous lock guards against a second tap in the same frame launching
    // a parallel capture before React re-renders `capturing`.
    if (busyRef.current || !cameraReady) return;
    busyRef.current = true;
    setCapturing(true);
    // Instant feedback the moment the shutter is tapped.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    triggerShutterFlash();
    try {
      // Cap JPEG quality so capture + crop do not jetsam with the live camera session.
      // Analysis must use the unmirrored sensor frame (never bake preview scaleX(-1)).
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        shutterSound: false,
        mirror: false,
        isImageMirror: false,
      });
      if (!photo?.uri) throw new Error('Could not capture the photo');
      const cameraCrop: CameraCrop = {
        viewportWidth: cameraViewport.width,
        viewportHeight: cameraViewport.height,
        viewfinder: {
          originX: scanFrameLeft,
          originY: viewfinderTop,
          width: finderW,
          height: finderH,
        },
      };
      // Drop the live CameraView before decode/crop (same jetsam class as library pick).
      setCameraInitialized(false);
      setAnalyzeStep(0);
      phaseRef.current = 'analyzing';
      setPhase('analyzing');
      trackEvent('first_scan_started', {});
      // Let React commit the unmount before ImageManipulator allocates.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      await analyze(photo.uri, cameraCrop);
    } catch (e: any) {
      showError(e.message ?? 'Could not capture the photo. Try again.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  }

  async function pickFromLibrary() {
    if (scanModeRef.current !== 'photo') return;
    if (busyRef.current) return;
    busyRef.current = true;
    setCapturing(true);
    // Unmount live camera while the system picker + HEIC decode run — prevents
    // iOS jetsam (app "just closes") from camera + full-res bitmap together.
    setLibraryPicking(true);
    setCameraInitialized(false);
    try {
      try {
        const allowed = await ensureCanScan();
        if (needsScanQuota && allowed === null) return;
      } catch {
        /* count failed — allow picker; analyze rechecks */
      }
      if (scanModeRef.current !== 'photo') return;
      const picked = await pickLibraryImage();
      if (!picked?.uri) return;
      await analyze(picked.uri);
    } catch (e: any) {
      showError(e?.message ?? 'Could not open your photo library. Try again.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
      setLibraryPicking(false);
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

  async function finishAnalysis(
    res: Analysis,
    opts?: { displayUri?: string | null; imageBase64?: string | null; usedNow?: number | null },
  ) {
    if (!res.is_food) {
      // Food-AI rejection belongs only to photo mode (never text).
      if (scanModeRef.current !== 'photo') return;
      showError(res.notes || "This doesn't look like food. Try a clearer description or photo.");
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
    setManualEntry(false);
    setAnalysis({ ...res, total_protein_g: safeProtein, calories: safeCalories });
    setProteinOverride(String(safeProtein));
    setCalorieOverride(String(safeCalories));
    setScannedAt(new Date());
    if (opts?.displayUri != null) setDisplayUri(opts.displayUri);
    if (opts?.imageBase64 != null) setImageBase64(opts.imageBase64);

    if (opts?.imageBase64 && session?.user.id) {
      photoUploadRef.current = uploadFoodPhoto(session.user.id, opts.imageBase64);
    } else {
      photoUploadRef.current = null;
    }

    if (needsScanQuota && session?.user.id) {
      setScansLeft(remainingFreeScans((opts?.usedNow ?? 0) + 1, profile));
      void recordPhotoScan(session.user.id, todayISODate(), {
        foodName: res.food_name,
        items: res.items,
        proteinG: safeProtein,
        calories: safeCalories,
        confidence: res.confidence,
      }).catch(() => {});
    }

    analyzeStageRef.current = 'done';
    setAnalyzeProgress(1);
    analyzeDoneRef.current = true;
    setPhase('result');
  }

  /** Open CONFIRM & LOG with an empty meal so they can add ingredients / edit / log. */
  async function continueWithText() {
    if (busyRef.current) return;
    if (profile && !isDailyDragonLockedForToday(profile, todayISODate())) {
      router.replace('/(tabs)/today');
      return;
    }
    busyRef.current = true;
    setCapturing(true);
    try {
      // Same freemium gate + consume as photo (1 free scan/day after trial).
      let usedAtStart: number | null = null;
      try {
        usedAtStart = await ensureCanScan();
        if (needsScanQuota && usedAtStart === null) return;
      } catch {
        /* count failed — recheck below */
      }
      if (needsScanQuota) {
        const usedNow = usedAtStart ?? 0;
        setScansLeft(remainingFreeScans(usedNow, profile));
        if (!canScan(profile!, usedNow)) {
          openPaywallForLimit();
          return;
        }
        if (session?.user.id) {
          setScansLeft(remainingFreeScans(usedNow + 1, profile));
          void recordPhotoScan(session.user.id).catch(() => {});
        }
      }

      setError(null);
      setDisplayUri(null);
      setPreviewSquare(false);
      setImageBase64(null);
      photoUploadRef.current = null;
      setManualEntry(true);
      setAnalysis({
        is_food: true,
        food_name: '',
        items: [],
        total_protein_g: 0,
        calories: 0,
        confidence: 'medium',
        notes: '',
      });
      setProteinOverride('0');
      setCalorieOverride('0');
      setScannedAt(new Date());
      analyzeDoneRef.current = true;
      trackEvent('first_scan_started', { mode: 'text' });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPhase('result');
    } catch (e: any) {
      showError(e?.message ?? 'Could not continue. Try again.');
    } finally {
      busyRef.current = false;
      setCapturing(false);
    }
  }

  // Clear food-AI errors when switching to text mode.
  useEffect(() => {
    if (scanMode === 'text') {
      setError((prev) => (prev && isFoodAnalyzeError(prev) ? null : prev));
    }
  }, [scanMode]);

  async function analyze(uri: string, cameraCrop?: CameraCrop) {
    // Hard gate: text must never hit analyze-food image path.
    if (scanModeRef.current !== 'photo') return;
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

    if (scanModeRef.current !== 'photo') return;

    // Unmount live camera before any ImageManipulator work (iOS jetsam otherwise).
    if (phaseRef.current === 'camera') {
      setCameraInitialized(false);
      setAnalyzeStep(0);
      phaseRef.current = 'analyzing';
      setPhase('analyzing');
      trackEvent('first_scan_started', {});
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    }
    try {
      analyzeStageRef.current = 'prep';
      setAnalyzeProgress(0.15);
      const square = await prepareSquareMealPhoto(uri, cameraCrop);

      if (scanModeRef.current !== 'photo') return;

      setDisplayUri(square.uri);
      setPreviewSquare(Boolean(cameraCrop));
      analyzeStageRef.current = 'ready';
      setAnalyzeProgress(0.38);

      const usedNow = usedAtStart;
      if (needsScanQuota && usedNow !== null) {
        setScansLeft(remainingFreeScans(usedNow, profile));
        if (!canScan(profile!, usedNow)) {
          openPaywallForLimit();
          return;
        }
      }
      setImageBase64(square.base64);

      analyzeStageRef.current = 'request';
      setAnalyzeProgress(0.55);
      const res = await analyzeFoodPhoto(square.base64, 'image/jpeg');
      if (scanModeRef.current !== 'photo') return;
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
      setManualEntry(false);
      setAnalysis({ ...res, total_protein_g: safeProtein, calories: safeCalories });
      setProteinOverride(String(safeProtein));
      setCalorieOverride(String(safeCalories));
      setScannedAt(new Date());

      // Kick off storage upload while the user reviews CONFIRM & LOG.
      if (session?.user.id) {
        photoUploadRef.current = uploadFoodPhoto(session.user.id, square.base64);
      }

      if (needsScanQuota && session?.user.id) {
        setScansLeft(remainingFreeScans((usedNow ?? 0) + 1, profile));
        void recordPhotoScan(session.user.id, todayISODate(), {
          foodName: res.food_name,
          items: res.items,
          proteinG: safeProtein,
          calories: safeCalories,
          confidence: res.confidence,
        }).catch(() => {});
      }

      analyzeStageRef.current = 'done';
      setAnalyzeProgress(1);
      analyzeDoneRef.current = true;
      setPhase('result');
    } catch (e: any) {
      if (scanModeRef.current !== 'photo') return;
      showError(e.message ?? 'Analysis failed. Check your connection and try again.');
    }
  }

  async function handleSave() {
    if (!analysis || !session) return;
    if (!profile) {
      setError('Profile still loading - wait a second and tap Log it again.');
      return;
    }
    const proteinEntered = parseNutritionNumber(proteinOverride);
    if (proteinEntered == null || proteinEntered < 0) {
      setError('Enter the protein amount in grams.');
      return;
    }
    let proteinG = proteinEntered;
    if (!manualEntry) {
      const proteinClamp = clampProteinOverride(proteinEntered, analysis.total_protein_g);
      if (proteinClamp.clamped) {
        setProteinOverride(String(proteinClamp.max));
        setError(
          `Protein capped at ${proteinClamp.max}g, the most we can verify from this photo. Scan again to log more.`,
        );
        return;
      }
      proteinG = proteinClamp.value;
    }

    const calorieRaw = calorieOverride.trim();
    const caloriesParsed = calorieRaw.length > 0 ? parseNutritionNumber(calorieRaw) : null;
    if (calorieRaw.length > 0 && caloriesParsed == null) {
      setError('Enter calories as a number.');
      return;
    }
    const caloriesEntered =
      caloriesParsed != null && caloriesParsed >= 0
        ? Math.round(caloriesParsed)
        : Number.isFinite(analysis.calories) && analysis.calories > 0
          ? Math.round(analysis.calories)
          : Math.max(Math.round(proteinG) * 8, 50);
    let calories = caloriesEntered;
    if (!manualEntry) {
      const calorieClamp = clampCalorieOverride(caloriesEntered, analysis.calories);
      if (calorieClamp.clamped) {
        setCalorieOverride(String(calorieClamp.max));
        setError(
          `Calories capped at ${calorieClamp.max}, the most we can verify from this photo.`,
        );
        return;
      }
      calories = calorieClamp.value;
    }
    setSaving(true);
    try {
      const todayISO = todayISODate();
      const foodName = analysis.food_name.trim() || 'Meal';
      const uploadPromise =
        photoUploadRef.current ??
        (imageBase64 ? uploadFoodPhoto(session.user.id, imageBase64) : null);

      // Don't block Log on storage. If upload already finished during review, take it;
      // otherwise attach image_path in the background after insert.
      const [todaySummary, wasFirstEver, imagePath] = await Promise.all([
        fetchTodayMealSummary(todayISO),
        needsFirstScan(),
        uploadPromise
          ? Promise.race([
              uploadPromise.catch(() => null),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
            ])
          : Promise.resolve(null),
      ]);

      // Insert + fresh profile in parallel (one less serial RTT).
      const [log, freshProfile] = await Promise.all([
        insertLog({
          userId: session.user.id,
          foodName,
          items: analysis.items,
          proteinG,
          calories,
          confidence: analysis.confidence,
          imagePath: imagePath ?? null,
          source: manualEntry ? 'manual' : 'photo',
        }),
        fetchProfile(session.user.id)
          .catch(() => null)
          .then((p) => p ?? profile!),
      ]);

      // Instant Today thumb from the local capture (before signed URL is ready).
      if (displayUri) rememberLocalMealPhoto(log.id, displayUri);

      if (imagePath) {
        void getFoodPhotoUrl(imagePath);
      } else if (uploadPromise || imageBase64) {
        void (uploadPromise ?? uploadFoodPhoto(session.user.id, imageBase64!))
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
        profile: freshProfile,
        todayTotalBefore: todaySummary.proteinSum,
        loggedProtein: proteinG,
        todayISO,
        yesterdayISO: todayISODate(-1),
      });

      let retention = markCareDay(getRetention({ ...freshProfile, ...updates }), todayISO);
      const loot = rollLootDrop(retention);
      retention = loot.next;
      const merged = { ...updates, retention };
      try {
        await Promise.all([
          saveProfile(merged, { baseProfile: freshProfile }),
          clearNeedsFirstScan(),
        ]);
      } catch (saveErr) {
        // Don't leave orphan meals that never awarded XP.
        await deleteLog(log.id).catch(() => {});
        throw saveErr;
      }

      const mealsToday = todaySummary.mealCount + 1;
      const dragonId = displayDragonId(freshProfile, todayISO);
      const dragonName = displayDragonName(freshProfile, dragonId);
      trackEvent(wasFirstEver ? 'first_meal_logged' : 'meal_logged', {
        protein_g: proteinG,
        meals_today: mealsToday,
      });
      if (loot.dropped) trackEvent('loot_drop', { shards: retention.egg_shards ?? 0 });
      if (streakFreezeUsed) trackEvent('streak_freeze_used', {});
      if (mealsToday === 1) {
        void scheduleSecondMealNudge(dragonName).catch(() => {});
      }

      const xpGained =
        Math.round(proteinG * XP_PER_GRAM) + (goalJustHit ? XP_GOAL_BONUS : 0);

      if (goalJustHit || evolved || leveledUp) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setCelebration({
          evolved,
          leveledUp,
          goalJustHit,
          xpGained,
          perkUnlocked,
          levelBefore,
          levelAfter,
          previousStageIndex: stageBeforeIndex,
          proteinG,
          foodName: analysis.food_name,
          lootDropped: loot.dropped,
          streakFreezeUsed,
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

  const cameraPermissionUiRaw = resolveCameraPermissionUi({
    permission,
    requesting: requestingCameraPermission,
  });
  // If the OS never answers, fall back to an explicit Continue CTA (never a dead spinner).
  useEffect(() => {
    if (
      cameraPermissionUiRaw === 'granted' ||
      cameraPermissionUiRaw === 'needs_prompt' ||
      cameraPermissionUiRaw === 'blocked'
    ) {
      setCameraPermissionTimedOut(false);
      return;
    }
    const t = setTimeout(() => setCameraPermissionTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [cameraPermissionUiRaw]);
  const cameraPermissionUi =
    cameraPermissionTimedOut &&
    (cameraPermissionUiRaw === 'loading' || cameraPermissionUiRaw === 'requesting')
      ? 'needs_prompt'
      : cameraPermissionUiRaw;
  const hasCameraPermission = cameraPermissionUi === 'granted';
  const cameraReady = hasCameraPermission && cameraInitialized;

  // Web: expo-camera CSS-mirrors front/desktop preview (scaleX(-1)) even when
  // capture uses mirror/isImageMirror false. Strip it so live preview = confirm.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (phase !== 'camera' || demoAutoScan || !hasCameraPermission || !cameraInitialized) {
      return;
    }
    return bindUnmirroredWebCameraPreview(cameraWrapRef.current);
  }, [phase, demoAutoScan, hasCameraPermission, cameraInitialized]);

  const headerTitle =
    phase === 'result' ? 'CONFIRM & LOG' : phase === 'analyzing' ? 'ANALYZING' : 'ProteinQuest';

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

  const applyIngredientEdit = useCallback((edit: ScanIngredientEdit) => {
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
      setProteinOverride(String(nextProtein));
      setCalorieOverride(String(nextCalories));
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
  }, []);

  // Prefer immediate flush from scan-adjust; keep focus consume as fallback.
  useEffect(() => registerIngredientEditApplier(applyIngredientEdit), [applyIngredientEdit]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      const edit = consumePendingIngredientEdit();
      if (edit) applyIngredientEdit(edit);
      return () => {
        setScreenFocused(false);
        if (Platform.OS !== 'web') {
          try {
            ExpoImage.clearMemoryCache();
          } catch {
            /* ignore */
          }
        }
      };
    }, [applyIngredientEdit]),
  );

  const freeScanPhotoMemory = useCallback(() => {
    setScreenFocused(false);
    setImageBase64(null);
    if (Platform.OS !== 'web') {
      try {
        ExpoImage.clearMemoryCache();
      } catch {
        /* ignore */
      }
    }
  }, []);

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
        {
          paddingTop: headerTop,
          paddingLeft: resultPadLeft,
          paddingRight: resultPadRight,
          width: formWidth,
          maxWidth: formMaxWidth,
          alignSelf: 'center',
        },
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
      <View style={styles.iconBtnSpacer} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {phase === 'result' || (demoAutoScan && phase === 'camera') ? renderHeader() : null}

      {error && !(scanMode === 'text' && isFoodAnalyzeError(error)) ? (
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
        <View
          ref={cameraWrapRef}
          style={[
            styles.cameraWrap,
            isWide && {
              maxWidth: Math.min(formMaxWidth, Math.max(stageMaxWidth + 120, 520)),
              width: '100%',
              alignSelf: 'center',
            },
          ]}
          onLayout={onCameraLayout}>
          {hasCameraPermission && !libraryPicking ? (
            <CameraView
              ref={setCameraRef}
              style={styles.camera}
              facing="back"
              // Native: do not mirror stills. Web preview flip is stripped separately
              // (expo-camera web ignores this for live <video> scaleX(-1)).
              mirror={false}
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
                    // Prefer ~1280px long side (matches EXPORT_MAX_SIDE). Larger stills jetsam on crop.
                    const ranked = sizes
                      .map((size) => {
                        const [a, b] = size.split('x').map((n) => Number(n));
                        const long = Math.max(a || 0, b || 0);
                        return { size, long };
                      })
                      .filter((s) => s.long > 0)
                      .sort((x, y) => {
                        const score = (long: number) =>
                          Math.abs(long - 1280) + (long > 2200 ? (long - 2200) * 0.75 : 0);
                        return score(x.long) - score(y.long);
                      });
                    if (ranked[0]?.size) setPictureSize(ranked[0].size);
                  } catch {
                    /* keep device default */
                  }
                })();
              }}
            />
          ) : libraryPicking ? (
            <View style={[styles.camera, styles.cameraDenied]} accessibilityLabel="Opening photo library">
              <ActivityIndicator size="large" color={colors.textSecondary} />
              <Text style={[styles.deniedTitle, { marginTop: spacing.md }]}>Opening photos</Text>
            </View>
          ) : cameraPermissionUi === 'loading' || cameraPermissionUi === 'requesting' ? (
            <View style={[styles.camera, styles.cameraDenied]} accessibilityLabel="Requesting camera access">
              <ActivityIndicator size="large" color={colors.textSecondary} />
              <Text style={[styles.deniedTitle, { marginTop: spacing.md }]}>
                {cameraPermissionUi === 'requesting' ? 'Requesting camera access' : 'Preparing camera'}
              </Text>
              <Text style={styles.deniedText}>
                ProteinQuest needs the camera to photograph your meal. You can also upload from your library.
              </Text>
            </View>
          ) : (
            <View style={[styles.camera, styles.cameraDenied]}>
              <Ionicons name="videocam-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.deniedTitle}>
                {cameraPermissionUi === 'blocked' ? 'Camera access is off' : 'Allow camera access'}
              </Text>
              <Text style={styles.deniedText}>
                {cameraPermissionUi === 'blocked'
                  ? 'Enable Camera for ProteinQuest in Settings, or upload a photo from your library instead.'
                  : 'ProteinQuest uses the camera to photograph meals and estimate protein. You can also upload from your library.'}
              </Text>
              {cameraPermissionUi === 'blocked' ? (
                <Button
                  title="Open Settings"
                  variant="secondary"
                  onPress={() => {
                    void Linking.openSettings();
                  }}
                  style={{ marginTop: spacing.lg, alignSelf: 'center', minWidth: 180 }}
                />
              ) : (
                <Button
                  title="Continue"
                  variant="secondary"
                  onPress={() => {
                    void ensureCameraPermission({ force: true });
                  }}
                  style={{ marginTop: spacing.lg, alignSelf: 'center', minWidth: 180 }}
                />
              )}
            </View>
          )}

          {scanMode === 'text' ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.textModeBackdrop]} />
          ) : null}

          {scanMode === 'text' ? (
            <Animated.View
              pointerEvents="none"
              entering={FadeIn.duration(280)}
              style={[
                styles.textModeHintWrap,
                {
                  top: topReserve + chromeGap,
                  bottom: botReserve + bottomGap,
                  paddingHorizontal: sideGutter,
                },
              ]}>
              <View style={styles.textModeHintChip}>
                <View style={[styles.textModeHintIcon, tinyH && { width: 22, height: 22, borderRadius: 11 }]}>
                  <Ionicons
                    name="restaurant"
                    size={tinyH ? 11 : 13}
                    color={colors.accent}
                  />
                </View>
                <Text
                  style={[
                    styles.textModeHintText,
                    tinyH && { fontSize: 12, lineHeight: 16 },
                  ]}>
                  Click Continue to add your food and ingredients
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {scanMode !== 'text' && hasCameraPermission ? (
            <ScanViewfinder
              width={finderW}
              height={finderH}
              top={viewfinderTop}
              left={scanFrameLeft}
              viewportW={vw}
              viewportH={vh}
              scale={uiScale}
            />
          ) : null}

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
              { paddingTop: headerTop + 44 + spacing.sm + brandDrop, zIndex: 30 },
            ]}>
            <View style={chromeColumnStyle}>
              <View
                style={[
                  styles.scanHero,
                  {
                    paddingTop: heroPadV,
                    paddingBottom: heroPadV,
                    marginBottom: heroBelow,
                    paddingHorizontal: brandSideClear,
                  },
                ]}>
                <View
                  style={[styles.scanBrandRow, { gap: brandGap, maxWidth: brandRowMaxW }]}
                  accessibilityRole="header">
                  {showBrandMark ? (
                    <Image
                      source={BRAND_MARK}
                      style={[
                        styles.scanBrandMark,
                        {
                          width: brandMarkSize,
                          height: brandMarkSize,
                          borderRadius: Math.round(brandMarkSize * 0.28),
                          flexShrink: 0,
                        },
                      ]}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.scanBrandTitle,
                      {
                        fontSize: brandTitleSize,
                        lineHeight: displayLH(brandTitleSize),
                        letterSpacing: brandTitleSize < 16 ? 0 : BRAND_LETTER_SPACING,
                        flexShrink: 0,
                      },
                    ]}
                    allowFontScaling={false}>
                    Protein
                    <Text style={styles.scanBrandTitleAccent}>Quest</Text>
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - botChromeH) > 1) setBotChromeH(h);
            }}
            pointerEvents="box-none"
            style={[
              styles.controls,
              {
                zIndex: 20,
                gap: controlsGap,
                paddingBottom: controlsPadBottom,
                alignItems: 'stretch',
              },
            ]}>
            <View
              style={[
                scanFrameColumnStyle,
                {
                  overflow: 'hidden',
                  marginBottom: Math.max(0, modeToggleToShutterGap - controlsGap),
                },
              ]}>
              <ScanModeToggle
                value={scanMode}
                onChange={(mode) => {
                  setError(null);
                  setScanMode(mode === 'text' ? 'text' : 'photo');
                }}
                disabled={capturing}
                itemH={modeToggleH}
                iconSize={modeToggleIconSize}
                tinyH={tinyH}
                compactH={compactH}
              />
            </View>

            <View
              style={[
                styles.shutterRow,
                shutterRowLayout,
                {
                  marginTop: 0,
                },
              ]}>
              <View style={styles.sideSlot}>
                {scanMode === 'text' ? (
                  renderSideSlotMirror()
                ) : (
                  <Pressable
                    onPress={pickFromLibrary}
                    disabled={capturing}
                    accessibilityLabel="Upload from gallery"
                    accessibilityRole="button"
                    style={[
                      styles.sideAction,
                      { gap: controlActionGap },
                      capturing && { opacity: 0.35 },
                    ]}
                    hitSlop={10}>
                    <View
                      style={[
                        styles.libraryBtn,
                        {
                          width: librarySize,
                          height: librarySize,
                          borderRadius: librarySize / 2,
                        },
                      ]}>
                      <Ionicons name="images-outline" size={libraryIconSize} color={colors.text} />
                    </View>
                    <Text
                      style={[
                        styles.sideActionLabel,
                        { height: controlLabelH, lineHeight: controlLabelH },
                      ]}>
                      GALLERY
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.centerSlot}>
                {scanMode === 'text' ? (
                  <Pressable
                    onPress={continueWithText}
                    disabled={capturing}
                    accessibilityLabel="Continue to confirm and log"
                    accessibilityRole="button"
                    style={[
                      styles.continueAction,
                      { gap: controlActionGap },
                      capturing && { opacity: 0.35 },
                    ]}>
                    <View
                      style={[
                        styles.continueBtn,
                        {
                          minWidth: Math.max(
                            tinyH || veryNarrow ? 128 : 152,
                            Math.round(shutterSize * (tinyH ? 1.55 : 1.85)),
                          ),
                          height: Math.max(
                            tinyH ? 44 : 50,
                            Math.round(shutterSize * (tinyH ? 0.62 : 0.7)),
                          ),
                          borderRadius: 13,
                          paddingHorizontal: tinyH || veryNarrow ? 14 : 18,
                        },
                      ]}>
                      <View pointerEvents="none" style={styles.continueBtnSheen} />
                      <Text
                        style={styles.continueBtnLabel}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.85}>
                        Continue
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={Math.max(15, Math.round(16 * uiScale))}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text
                      style={[
                        styles.scanActionLabel,
                        { height: controlLabelH, lineHeight: controlLabelH, opacity: 0 },
                      ]}>
                      SCAN
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={capture}
                    disabled={!cameraReady || capturing}
                    accessibilityLabel="Scan meal"
                    accessibilityRole="button"
                    style={[
                      styles.scanAction,
                      { gap: controlActionGap },
                      (!cameraReady || capturing) && { opacity: 0.35 },
                    ]}>
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
                    <Text
                      style={[
                        styles.scanActionLabel,
                        { height: controlLabelH, lineHeight: controlLabelH },
                      ]}>
                      SCAN
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.sideSlot}>{renderSideSlotMirror()}</View>
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
        </View>
      )}

      {phase === 'analyzing' && (
        <Animated.View
          entering={FadeIn}
          style={[
            styles.analyzingWrap,
            {
              maxWidth: formMaxWidth,
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
          </View>

          <View style={styles.analyzingFooter}>
            <Text style={styles.analyzingStatus}>
              Analyzing...
            </Text>
            <AnalyzingProgressBar progress={analyzeProgress} />
          </View>
        </Animated.View>
      )}

      {phase === 'result' && analysis && (
        <ScrollView
          contentContainerStyle={[
            styles.resultScroll,
            {
              paddingLeft: resultPadLeft,
              paddingRight: resultPadRight,
              maxWidth: formMaxWidth,
              width: formWidth,
              alignSelf: 'center',
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          onScrollBeginDrag={dismissMealKeyboard}
          showsVerticalScrollIndicator={false}>
          {displayUri && screenFocused ? (
            <Enter
              {...enterFade()}
              style={[
                styles.resultImageWrap,
                {
                  maxWidth: Math.min(
                    stageMaxWidth,
                    isTablet || isDesktop ? 480 : 420,
                  ),
                },
              ]}>
              <Pressable
                onPress={dismissMealKeyboard}
                accessibilityRole="none"
                style={styles.resultPhotoShell}>
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
              </Pressable>
            </Enter>
          ) : displayUri ? (
            <View
              style={[
                styles.resultImageWrap,
                {
                  maxWidth: Math.min(
                    stageMaxWidth,
                    isTablet || isDesktop ? 480 : 420,
                  ),
                  aspectRatio: previewSquare ? 1 : 3 / 4,
                },
              ]}
            />
          ) : null}

          <Enter {...enterProps(80)} style={styles.resultTitleBlock}>
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
                blurOnSubmit
                onSubmitEditing={dismissMealKeyboard}
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
            <Pressable onPress={dismissMealKeyboard} accessibilityRole="none">
              <Text style={styles.metaText}>{formatScanMeta(scannedAt)}</Text>
            </Pressable>
          </Enter>

          <Enter {...enterProps(160)} style={styles.nutritionCard}>
            <View style={styles.nutritionCol}>
              <Pressable onPress={dismissMealKeyboard} accessibilityRole="none">
                <Text style={styles.totalLabel}>TOTAL PROTEIN</Text>
              </Pressable>
              <View style={styles.totalInputRow}>
                <TextInput
                  ref={proteinInputRef}
                  style={[
                    styles.totalInput,
                    textInputWeb,
                    Platform.OS === 'web'
                      ? ({ width: `${Math.max(proteinOverride.length, 1)}ch` } as object)
                      : null,
                  ]}
                  value={proteinOverride}
                  onChangeText={(t) => setProteinOverride(sanitizeNutritionDraft(t))}
                  keyboardType="numeric"
                  maxLength={16}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={dismissMealKeyboard}
                />
                <Text style={styles.totalUnit}>g</Text>
              </View>
              <Pressable onPress={dismissMealKeyboard} accessibilityRole="none">
                <Text style={styles.totalHint}>
                  {manualEntry
                    ? 'tap to adjust • add ingredients below'
                    : `tap to adjust • max ${maxAllowedOverride(analysis.total_protein_g, PROTEIN_OVERRIDE_BUFFER_G)}g`}
                </Text>
              </Pressable>
            </View>
            <View style={styles.nutritionDivider} />
            <View style={styles.nutritionCol}>
              <Pressable onPress={dismissMealKeyboard} accessibilityRole="none">
                <Text style={styles.totalLabel}>CALORIES</Text>
              </Pressable>
              <View style={styles.totalInputRow}>
                <TextInput
                  ref={calorieInputRef}
                  style={[
                    styles.totalInput,
                    textInputWeb,
                    Platform.OS === 'web'
                      ? ({ width: `${Math.max(calorieOverride.length, 1)}ch` } as object)
                      : null,
                  ]}
                  value={calorieOverride}
                  onChangeText={(t) => setCalorieOverride(sanitizeNutritionDraft(t))}
                  keyboardType="numeric"
                  maxLength={16}
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={dismissMealKeyboard}
                />
                <Text style={styles.totalUnit}>cal</Text>
              </View>
              <Pressable onPress={dismissMealKeyboard} accessibilityRole="none">
                <Text style={styles.totalHint}>
                  {manualEntry
                    ? 'tap to adjust • add ingredients below'
                    : `tap to adjust • max ${maxAllowedOverride(analysis.calories, CALORIE_OVERRIDE_BUFFER)}`}
                </Text>
              </Pressable>
            </View>
          </Enter>

          <Enter {...enterProps(220)}>
            <View style={styles.ingredientsCard}>
              <Pressable
                onPress={dismissMealKeyboard}
                accessibilityRole="none"
                style={styles.ingredientsHeader}>
                <Text style={styles.ingredientsTitle}>
                  INGREDIENTS ({analysis.items.length})
                </Text>
              </Pressable>

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
                      dismissMealKeyboard();
                      freeScanPhotoMemory();
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
                      const href = `/scan-adjust?${q.toString()}`;
                      InteractionManager.runAfterInteractions(() => {
                        router.push(href as never);
                      });
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
                // Free multi-MB base64 + photo before push — otherwise OOM-kills on Add.
                freeScanPhotoMemory();
                InteractionManager.runAfterInteractions(() => {
                  router.push('/scan-ingredient' as never);
                  runAfterNav(() => {
                    dismissMealKeyboard();
                    Haptics.selectionAsync().catch(() => {});
                  });
                });
              }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.addIngredientRow,
                pressableWeb,
                pressed && { opacity: 0.88 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add ingredient">
              <View style={styles.addIngredientIcon} pointerEvents="none">
                <Ionicons name="add" size={18} color={colors.accent} />
              </View>
              <Text style={styles.addIngredientText} pointerEvents="none">
                Add ingredient
              </Text>
            </Pressable>
          </Enter>

          <Enter {...enterProps(320)} style={styles.resultActions}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => [
                styles.logItBtn,
                pressableWeb,
                saving && styles.logItBtnDisabled,
                pressed && !saving && styles.logItBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log it">
              <LinearGradient
                pointerEvents="none"
                colors={['#FF9B82', '#FF7A59', '#E85F42']}
                locations={[0, 0.48, 1]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.logItSheen} />
              <View style={styles.logItInner}>
                {saving ? (
                  <Text style={styles.logItBtnText}>Saving…</Text>
                ) : (
                  <>
                    <Ionicons name="checkmark" size={19} color={colors.onAccent} />
                    <Text style={styles.logItBtnText}>Log it</Text>
                  </>
                )}
              </View>
            </Pressable>
            <Pressable
              onPress={() => requestLeaveUnsaved(resetToCamera)}
              style={({ pressed }) => [
                styles.retakeBtn,
                pressableWeb,
                pressed && styles.retakeBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={manualEntry ? 'Start over' : 'Retake Scan'}>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.015)']}
                locations={[0, 0.55, 1]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.retakeSheen} />
              <View style={styles.retakeInner}>
                <Ionicons
                  name={manualEntry ? 'arrow-back' : 'refresh'}
                  size={17}
                  color={colors.text}
                />
                <Text style={styles.retakeBtnText}>
                  {manualEntry ? 'Start over' : 'Retake Scan'}
                </Text>
              </View>
            </Pressable>
          </Enter>
        </ScrollView>
      )}

      <View
        style={styles.discardRoot}
        pointerEvents={discardOpen ? 'auto' : 'none'}
        accessibilityViewIsModal={discardOpen}
        importantForAccessibility={discardOpen ? 'yes' : 'no-hide-descendants'}>
        <ModalMotionLayer
          visible={discardOpen}
          cardStyle={styles.discardCardWrap}
          backdrop={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              style={styles.discardBackdrop}
              onPress={cancelDiscard}
            />
          }>
            <GlassPanel modal style={styles.discardCard}>
              <View style={styles.discardSheen} pointerEvents="none" />
              <Text style={styles.discardTitle}>Save this scan?</Text>
              <Text style={styles.discardBody}>
                Are you sure you do not want to save this? It will be lost.
              </Text>
              <View style={styles.discardActions}>
                <Pressable
                  onPress={cancelDiscard}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Keep editing"
                  style={({ pressed }) => [
                    styles.discardPrimary,
                    pressed && styles.discardPrimaryPressed,
                  ]}>
                  <Text style={styles.discardPrimaryLabel}>Keep editing</Text>
                </Pressable>
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
        </ModalMotionLayer>
      </View>

      {profile ? (
        <Celebration
          visible={!!celebration}
          profile={profile}
          evolved={celebration?.evolved ?? false}
          leveledUp={celebration?.leveledUp ?? false}
          goalJustHit={celebration?.goalJustHit ?? false}
          xpGained={celebration?.xpGained}
          perkUnlocked={celebration?.perkUnlocked}
          levelBefore={celebration?.levelBefore}
          levelAfter={celebration?.levelAfter}
          previousStageIndex={celebration?.previousStageIndex}
          onDone={() => {
            const snap = celebration;
            setCelebration(null);
            goHome({
              fed: true,
              protein: snap?.proteinG,
              loot: snap?.lootDropped,
              freeze: snap?.streakFreezeUsed,
              food: snap?.foodName?.trim() || analysis?.food_name?.trim() || undefined,
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
    width: layout.iconBtn,
    height: layout.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.iconBtn / 2,
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
  },
  iconBtnSpacer: {
    width: layout.iconBtn,
    height: layout.iconBtn,
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
  errorBannerOutlined: {
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 89, 0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 122, 89, 0.55)',
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
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
    justifyContent: 'center',
    width: '100%',
    paddingTop: 0,
    paddingBottom: spacing.xs,
  },
  scanBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'nowrap',
    alignSelf: 'center',
    overflow: 'visible',
  },
  scanBrandMark: {
    backgroundColor: colors.bg,
  },
  scanBrandTitle: {
    ...noTextCaret,
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    flexShrink: 0,
    overflow: 'visible',
  },
  scanBrandTitleAccent: {
    color: colors.accent,
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
  finderGuideTipOutside: {
    position: 'absolute',
    alignItems: 'center',
  },
  finderGuideTipText: {
    textAlign: 'center',
    textShadowColor: 'rgba(12, 11, 16, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  modeToggle: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: '100%',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modeToggleItem: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: 'row',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modeToggleItemOn: {
    backgroundColor: 'rgba(90, 42, 34, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 122, 89, 0.28)',
  },
  modeToggleLabel: {
    flexShrink: 1,
    fontFamily: fonts.displayHeavy,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  textModeBackdrop: {
    // Match viewfinder dim: translucent dark over live camera, not solid colors.bg.
    backgroundColor: 'rgba(12, 11, 16, 0.62)',
  },
  textModeHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textModeHintChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 292,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(14px) saturate(1.2)',
          WebkitBackdropFilter: 'blur(14px) saturate(1.2)',
        } as object)
      : {}),
  },
  textModeHintIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 122, 89, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 122, 89, 0.45)',
  },
  textModeHintText: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(246,244,248,0.88)',
  },
  continueAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 210, 190, 0.55)',
    backgroundColor: 'rgba(255, 122, 89, 0.78)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(10px) saturate(1.25)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.25)',
          boxShadow:
            '0 6px 16px rgba(255,122,89,0.22), inset 0 1px 0 rgba(255,255,255,0.28)',
        } as object)
      : {
          shadowColor: '#FF7A59',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }),
  },
  continueBtnSheen: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.38)',
    opacity: 0.7,
  },
  continueBtnLabel: {
    fontFamily: fonts.displayHeavy,
    fontSize: 17,
    letterSpacing: 0.2,
    color: '#FFFFFF',
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
  barcodeControlsCol: {
    width: '100%',
    flexGrow: 1,
    gap: 8,
    alignItems: 'center',
    alignSelf: 'center',
  },
  barcodeAutoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 89, 0.5)',
    backgroundColor: 'rgba(12, 11, 16, 0.62)',
  },
  barcodeAutoChipText: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    color: colors.text,
    flexShrink: 1,
    textAlign: 'center',
  },
  manualBarcodeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 89, 0.35)',
    backgroundColor: 'rgba(255, 122, 89, 0.1)',
  },
  manualBarcodeLinkText: {
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
  },
  barcodeHintBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 122, 89, 0.4)',
    backgroundColor: 'rgba(12, 11, 16, 0.88)',
  },
  barcodeHintText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  manualBarcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualBarcodeInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  manualBarcodeGo: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  manualBarcodeGoText: {
    fontFamily: fonts.displayMedium,
    fontSize: 13,
    color: '#fff',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: '100%',
  },
  shutterRowCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  /** Equal left/right flex slots keep the shutter optically centered. */
  sideSlot: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  centerSlot: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  sideAction: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 64,
  },
  sideActionLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: 'rgba(246,244,248,0.88)',
    textAlign: 'center',
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  libraryBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 11, 16, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(12px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(12px) saturate(1.15)',
        } as object)
      : {}),
  },
  scanAction: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  scanActionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.accent,
    textAlign: 'center',
    textTransform: 'uppercase',
    includeFontPadding: false,
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
    gap: 10,
    marginTop: spacing.lg,
  },
  logItBtn: {
    height: 52,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: colors.accent,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow:
            '0 10px 28px rgba(255,122,89,0.34), 0 2px 0 rgba(255,255,255,0.18) inset, 0 -1px 0 rgba(0,0,0,0.18) inset',
        } as object)
      : {
          shadowColor: '#FF7A59',
          shadowOpacity: 0.36,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }),
  },
  logItBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  logItBtnDisabled: {
    opacity: 0.5,
  },
  logItSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.42)',
    opacity: 0.85,
  },
  logItInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
  },
  logItBtnText: {
    ...noTextCaret,
    fontFamily: fonts.displayHeavy,
    fontSize: 16,
    lineHeight: 20,
    color: colors.onAccent,
    letterSpacing: 0.15,
  },
  retakeBtn: {
    height: 50,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(22px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
          boxShadow: '0 8px 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.1)',
        } as object)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 4,
        }),
  },
  retakeBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  retakeSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth * 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    opacity: 0.65,
  },
  retakeInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
  },
  retakeBtnText: {
    ...noTextCaret,
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    lineHeight: 19,
    color: colors.text,
    letterSpacing: 0.15,
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
    backgroundColor: 'rgba(6, 5, 10, 0.72)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(6px) saturate(1.15)',
          WebkitBackdropFilter: 'blur(6px) saturate(1.15)',
        } as object)
      : null),
  },
  discardCardWrap: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    overflow: 'hidden',
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
    gap: spacing.sm,
  },
  discardPrimary: {
    ...pressableWeb,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderRadius: 13,
    backgroundColor: colors.accent,
    boxShadow: '0 4px 14px rgba(255, 122, 89, 0.28), 0 1px 3px rgba(0,0,0,0.22)',
    elevation: 3,
  },
  discardPrimaryPressed: {
    backgroundColor: colors.accentPressed,
    opacity: 0.96,
  },
  discardPrimaryLabel: {
    fontFamily: fonts.displayMedium,
    fontSize: 15,
    letterSpacing: 0.2,
    color: colors.onAccent,
  },
  discardSecondary: {
    ...pressableWeb,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: 12,
  },
  discardSecondaryPressed: {
    opacity: 0.7,
  },
  discardSecondaryLabel: {
    fontFamily: fonts.displayMedium,
    fontSize: 14,
    letterSpacing: 0.15,
    color: colors.textSecondary,
  },
});
