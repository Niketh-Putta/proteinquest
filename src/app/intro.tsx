import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DragonPortrait } from '@/components/DragonPortrait';
import {
  DISPLAY_NAME_TAKEN,
  isDisplayNameAvailable,
  isDisplayNameTakenError,
} from '@/lib/display-name';
import { trackEvent } from '@/lib/analytics';
import { DRAGONS, buildDragonNames, normalizeDragonName, warmDragonPreviewArt } from '@/lib/character';
import { useLayout, usePinnedFooterGap, useStickyFooterClearance } from '@/lib/layout';
import { useSpecialDeviceLayout } from '@/lib/special-device';
import { useSession } from '@/lib/session';
import { setPreferredName } from '@/lib/xp';
import type { DragonId } from '@/lib/types';
import { colors, displayLH, fonts, layout, noTextCaret, pressableWeb, spacing, textInputWeb } from '@/theme';

/** Compressed intro hero (~145KB webp) — full fire-5.png is 2.8MB and stalls first paint. */
const HERO_ART = require('@/assets/character/dragons/fire-5-intro.webp');
const EMBERS_VIDEO = require('@/assets/video/embers.mp4');
const IS_ANDROID = Platform.OS === 'android';

type Phase = 'hero' | 'name' | 'dragons' | 'benefits' | 'manifesto';

const PHASES: Phase[] = ['hero', 'name', 'dragons', 'benefits', 'manifesto'];

/** Cinematic opening title sequence: each word holds, then yields to the next. */
const TITLE_WORDS = ['FUEL.', 'FEED.', 'EVOLVE.'];
const WORD_HOLD_MS = 1250;

const BENEFITS = [
  'Build real muscle',
  'Recover faster',
  'Stay full longer',
  'Hold strength for decades',
];

const MANIFESTO = [
  { lead: 'Protein', rest: ' is your XP.' },
  { lead: 'Streaks', rest: ' are your skills.' },
  { lead: 'Your body', rest: ' is your character.' },
];

/** Slow Ken Burns drift — iOS/web only. Android stays static for instant decode. */
function KenBurnsHero() {
  const t = useSharedValue(0);
  useEffect(() => {
    if (IS_ANDROID) return;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [t]);

  const style = useAnimatedStyle(() =>
    IS_ANDROID
      ? { transform: [{ scale: 1.1 }] }
      : {
          transform: [
            { scale: interpolate(t.value, [0, 1], [1.08, 1.22]) },
            { translateX: interpolate(t.value, [0, 1], [0, -18]) },
            { translateY: interpolate(t.value, [0, 1], [0, -10]) },
          ],
        },
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image
        source={HERO_ART}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        priority="high"
        cachePolicy="memory-disk"
        recyclingKey="intro-hero"
      />
    </Animated.View>
  );
}

/** Looping ember video — deferred / skipped on Android (3MB decode freezes first frame). */
function EmberOverlay() {
  const [mountVideo, setMountVideo] = useState(false);

  useEffect(() => {
    if (IS_ANDROID) return;
    const t = setTimeout(() => setMountVideo(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!mountVideo) return null;
  return <EmberOverlayPlayer />;
}

function EmberOverlayPlayer() {
  const player = useVideoPlayer(EMBERS_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Hold the layer hidden until the video is actually playing. Before playback,
  // the underlying <video> element renders at its intrinsic size in the top-left
  // corner, which otherwise shows as a stray dark box over the hero.
  const [ready, setReady] = useState(false);

  // Kick playback after mount; a play() inside the setup callback can be
  // dropped on web before the view attaches (muted, so autoplay is allowed).
  // Retry briefly because the first play can race the view attaching.
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      try {
        if (player.playing) {
          setReady(true);
          clearInterval(timer);
          return;
        }
        if (tries > 12) {
          clearInterval(timer);
          return;
        }
        player.play();
      } catch {
        clearInterval(timer);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [player]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.emberLayer, { opacity: ready ? 0.5 : 0 }]}>
      <VideoView
        player={player}
        style={styles.emberVideo}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

/**
 * One word of the opening title. Each word glides out before the next glides
 * in via a single shared-value crossfade, so the swap reads as a smooth
 * hand-off rather than a hard cut.
 *
 * Only transform + opacity are animated (both GPU-composited). We deliberately
 * do NOT animate `letterSpacing`: it is a text-layout property, so animating it
 * forces a full glyph relayout every frame, which is what made the sequence
 * look jittery. The animation is driven entirely by shared values — no
 * key-based remounts or `exiting` layout animations, which hang on Android
 * release builds with the React Compiler enabled.
 */
function TitleWord({
  word,
  compact,
  sizeStyle,
}: {
  word: string;
  compact: boolean;
  sizeStyle: { fontSize: number; lineHeight: number };
}) {
  const p = useSharedValue(0);
  // The text actually rendered. It only swaps once the outgoing word has
  // finished gliding away, so the two words never visibly overlap.
  const [shown, setShown] = useState(word);

  // Glide the freshly-shown word in.
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 540, easing: Easing.out(Easing.cubic) });
  }, [shown, p]);

  // When the target word changes, glide the current one out, then swap.
  useEffect(() => {
    if (word === shown) return;
    p.value = withTiming(1, { duration: 1 }); // ensure we start from a settled state
    p.value = withTiming(0, { duration: 260, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(setShown)(word);
    });
  }, [word, shown, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      { translateY: interpolate(p.value, [0, 1], [20, 0]) },
      { scale: interpolate(p.value, [0, 1], [0.97, 1]) },
    ],
  }));

  return (
    <View style={styles.titleWordWrap}>
      <Animated.Text
        style={[styles.heroWord, compact && styles.heroWordCompact, sizeStyle, style]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {shown}
      </Animated.Text>
    </View>
  );
}

/**
 * Three-step progress dots beneath the opening title. Makes the sequence read
 * as "advancing" rather than "stuck on the first word" — the exact failure the
 * old Android build showed.
 */
function TitleDots({ index, total }: { index: number; total: number }) {
  return (
    <View style={styles.titleDots} pointerEvents="none">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.titleDot, i <= index ? styles.titleDotOn : styles.titleDotOff]}
        />
      ))}
    </View>
  );
}

/** Brand wordmark that breathes its letter-spacing open. */
function BrandReveal() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(250, withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }));
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0, 0.9]),
    letterSpacing: interpolate(p.value, [0, 1], [2, 7]),
  }));
  return <Animated.Text style={[styles.brand, style]}>PROTEINQUEST</Animated.Text>;
}

/** Soft pulsing accent glow anchored low behind the CTA. */
function PulseGlow() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.16, 0.34]),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.94, 1.05]) }],
  }));
  return <Animated.View style={[styles.glow, style]} />;
}

/** Animated progress bar shared across the post-hero phases. */
function PhaseProgress({ index, total }: { index: number; total: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withSpring(index / (total - 1), { damping: 18, stiffness: 120 });
  }, [index, total, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

export default function IntroScreen() {
  const { saveProfile, loading: sessionLoading, session } = useSession();
  const { horizontalPad, formMaxWidth, height, width, isDesktop } = useLayout();
  const special = useSpecialDeviceLayout();
  const insets = useSafeAreaInsets();
  const isCompact = height < 700 || width < 390;
  const isTiny = height < 640 || width < 360;
  const footerGap = usePinnedFooterGap(isCompact);
  /** Pinned CTA (~52) + footer pad so name field never sits under Continue. */
  const footerClearance = useStickyFooterClearance(isTiny || isCompact);
  const phaseScrollRef = useRef<ScrollView>(null);

  const [phase, setPhase] = useState<Phase>('hero');
  const [wordIndex, setWordIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [name, setName] = useState('');
  const [dragonIndex, setDragonIndex] = useState(0);
  const [dragonNames, setDragonNames] = useState<Partial<Record<DragonId, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phaseIndex = PHASES.indexOf(phase);
  const namingDragon = DRAGONS[dragonIndex];
  const dragonPortraitSizeBase = isTiny ? 88 : isCompact ? 112 : 160;
  /** Keyboard height while typing a dragon name — shrink portrait so field + CTA stay on screen. */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Fit portrait into remaining viewport (and under an open keyboard) so we never
  // need scrollToEnd, which used to yeet the dragon off-screen intermittently.
  const namingCopyBudget = isTiny ? 140 : isCompact ? 175 : 210;
  const namingChrome =
    48 + // top bar
    56 + // CTA button row
    footerGap +
    namingCopyBudget +
    Math.max(insets.top + insets.bottom, 0) * 0.2;
  const keyboardReserve =
    phase === 'dragons' && keyboardHeight > 0
      ? Math.max(0, keyboardHeight - Math.max(insets.bottom, 0) - 8)
      : 0;
  const dragonFitMax = Math.max(
    keyboardReserve > 0 ? 56 : 72,
    Math.floor(height - namingChrome - 40 - keyboardReserve),
  );
  const dragonPortraitSize = Math.min(
    Math.round(dragonPortraitSizeBase * special.specialScale),
    dragonFitMax,
  );

  // Baby dragon PNGs are ~2MB each — warm all three as soon as intro mounts so
  // the naming step never paints an empty frame.
  useEffect(() => {
    warmDragonPreviewArt();
  }, []);

  useEffect(() => {
    if (phase === 'name' || phase === 'dragons') warmDragonPreviewArt();
  }, [phase]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      // Keep content anchored at top; portrait shrinks to leave room for the field.
      if (phase === 'dragons') {
        requestAnimationFrame(() => {
          phaseScrollRef.current?.scrollTo({ y: 0, animated: true });
        });
      }
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
      if (phase === 'dragons') {
        requestAnimationFrame(() => {
          phaseScrollRef.current?.scrollTo({ y: 0, animated: true });
        });
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [phase]);

  function scrollNameFieldIntoView() {
    // User-name step only: nudge field above the pinned Continue CTA.
    // Dragon steps: KeyboardAvoidingView + live portrait resize keep the field
    // clear without scrollToEnd (that was the off-screen bug).
    if (phase === 'dragons') {
      requestAnimationFrame(() => {
        phaseScrollRef.current?.scrollTo({ y: 0, animated: true });
      });
      return;
    }
    requestAnimationFrame(() => {
      phaseScrollRef.current?.scrollToEnd({ animated: true });
    });
  }

  useEffect(() => {
    if (phase === 'name') {
      const t = setTimeout(scrollNameFieldIntoView, 80);
      return () => clearTimeout(t);
    }
    if (phase === 'dragons') {
      setKeyboardHeight(0);
      const t = setTimeout(() => {
        phaseScrollRef.current?.scrollTo({ y: 0, animated: false });
      }, 16);
      return () => clearTimeout(t);
    }
  }, [phase, dragonIndex]);

  // Opening title sequence: FUEL. FEED. EVOLVE. → settle on the brand statement.
  useEffect(() => {
    if (phase !== 'hero' || titleDone) return;
    const timer = setTimeout(() => {
      if (wordIndex < TITLE_WORDS.length - 1) setWordIndex((i) => i + 1);
      else setTitleDone(true);
    }, WORD_HOLD_MS);
    return () => clearTimeout(timer);
  }, [phase, wordIndex, titleDone]);

  // Scale the title type with viewport width so it never clips on narrow phones.
  const heroType = useMemo(() => {
    const base = Math.round(
      Math.max(44, Math.min(width * 0.165, isDesktop ? 108 : 88)),
    );
    return { fontSize: base, lineHeight: displayLH(base) };
  }, [width, isDesktop]);

  function next() {
    setError(null);
    setPhase(PHASES[Math.min(phaseIndex + 1, PHASES.length - 1)]);
  }

  function back() {
    setError(null);
    if (phase === 'dragons' && dragonIndex > 0) {
      setDragonIndex((i) => i - 1);
      return;
    }
    if (phaseIndex > 0) setPhase(PHASES[phaseIndex - 1]);
  }

  function submitDragonName() {
    setError(null);
    const chosen =
      normalizeDragonName(dragonNames[namingDragon.id] ?? '') || namingDragon.name;
    setDragonNames((prev) => ({ ...prev, [namingDragon.id]: chosen }));
    if (dragonIndex < DRAGONS.length - 1) {
      setDragonIndex((i) => i + 1);
    } else {
      next();
    }
  }

  async function submitName() {
    const chosen = name.trim();
    if (chosen) {
      try {
        const available = await isDisplayNameAvailable(chosen);
        if (!available) {
          setError(DISPLAY_NAME_TAKEN);
          Alert.alert('Username already exists', DISPLAY_NAME_TAKEN);
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not check that name.');
        return;
      }
      await setPreferredName(chosen);
    }
    setError(null);
    next();
  }

  async function finish() {
    if (sessionLoading || !session) {
      setError('Still connecting. Please wait a moment and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const chosen = name.trim();
      if (chosen) {
        const available = await isDisplayNameAvailable(chosen);
        if (!available) {
          setError(DISPLAY_NAME_TAKEN);
          Alert.alert('Username already exists', DISPLAY_NAME_TAKEN);
          setSaving(false);
          setPhase('name');
          return;
        }
      }
      const names = buildDragonNames(dragonNames);
      await saveProfile({
        intro_completed: true,
        ...(chosen ? { display_name: chosen } : {}),
        dragon_names: names,
      });
      trackEvent('dragon_named', { named: Object.keys(names).length });
      router.replace('/onboarding');
    } catch (e: unknown) {
      if (__DEV__ && e) console.error('[intro] saveProfile failed:', e);
      if (isDisplayNameTakenError(e)) {
        setError(DISPLAY_NAME_TAKEN);
        Alert.alert('Username already exists', DISPLAY_NAME_TAKEN);
        setPhase('name');
      } else {
        setError(e instanceof Error ? e.message : 'Could not save progress');
      }
      setSaving(false);
    }
  }

  // --- Phase: cinematic hero ---
  if (phase === 'hero') {
    return (
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
          <KenBurnsHero />
          <EmberOverlay />
          <LinearGradient
            colors={['rgba(12,11,16,0.86)', 'rgba(12,11,16,0.28)', 'rgba(12,11,16,0.97)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <PulseGlow />
        </View>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <Pressable
            style={[
              styles.inner,
              { paddingHorizontal: horizontalPad, maxWidth: formMaxWidth },
            ]}
            onPress={() => {
              // Tap anywhere to skip straight to the settled title.
              if (!titleDone) {
                setWordIndex(TITLE_WORDS.length - 1);
                setTitleDone(true);
              }
            }}>
            <BrandReveal />

            <View style={styles.heroCenter}>
              {!titleDone ? (
                <>
                  <TitleWord
                    word={TITLE_WORDS[wordIndex]}
                    compact={isCompact}
                    sizeStyle={heroType}
                  />
                  <TitleDots index={wordIndex} total={TITLE_WORDS.length} />
                </>
              ) : (
                <View style={styles.heroSettled}>
                  <Text
                    style={[styles.heroWord, isCompact && styles.heroWordCompact, heroType]}
                    numberOfLines={1}
                    adjustsFontSizeToFit>
                    EVOLVE.
                  </Text>
                  <Animated.Text
                    entering={FadeInDown.delay(250).duration(600)}
                    style={[styles.heroSub, isCompact && styles.heroSubCompact]}>
                    Hit your protein. Feed your dragon.{'\n'}Level up for real.
                  </Animated.Text>
                </View>
              )}
            </View>

            <Animated.View
              entering={FadeInDown.delay(IS_ANDROID ? 120 : 400).duration(500)}
              style={[styles.heroFooter, { paddingBottom: footerGap }]}>
              <Button title="Get started" onPress={next} />
              <Text style={styles.heroTagline}>ARE YOU READY TO LEVEL UP?</Text>
            </Animated.View>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // --- Phases: name / benefits / manifesto ---
  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors.bgRaised, colors.bg]} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.noPointer]}>
        <PulseGlow />
      </View>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 8) : 0}>
          <View
            style={[
              styles.inner,
              { paddingHorizontal: horizontalPad, maxWidth: formMaxWidth },
            ]}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => {
                  Keyboard.dismiss();
                  back();
                }}
                hitSlop={8}
                style={[styles.backBtn, pressableWeb]}>
                <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
              </Pressable>
              <PhaseProgress index={phaseIndex} total={PHASES.length} />
              <View style={styles.backBtn} />
            </View>

            <ScrollView
              ref={phaseScrollRef}
              style={styles.phaseScroll}
              contentContainerStyle={[
                styles.phaseScrollContent,
                (phase === 'dragons' || phase === 'name') && styles.phaseScrollContentNamed,
                { paddingBottom: footerClearance },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              onScrollBeginDrag={Keyboard.dismiss}
              showsVerticalScrollIndicator={false}
              bounces={phase !== 'dragons'}>
              {phase === 'name' ? (
                <Animated.View
                  key="name"
                  entering={FadeInDown.duration(380)}
                  exiting={FadeOut.duration(160)}
                  style={styles.phaseBody}>
                  <Pressable onPress={Keyboard.dismiss} accessibilityRole="none">
                    <Text style={[styles.question, isCompact && styles.questionCompact]}>
                      What should{'\n'}we call you?
                    </Text>
                  </Pressable>
                  <TextInput
                    style={[styles.nameInput, isCompact && styles.nameInputCompact, textInputWeb]}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={24}
                    returnKeyType="done"
                    blurOnSubmit
                    onFocus={scrollNameFieldIntoView}
                    onSubmitEditing={submitName}
                  />
                </Animated.View>
              ) : null}

              {phase === 'dragons' ? (
                <Animated.View
                  key={`dragons-${namingDragon.id}`}
                  entering={FadeInDown.duration(380)}
                  exiting={FadeOut.duration(160)}
                  style={styles.phaseBody}>
                  <Text style={styles.kicker}>
                    DRAGON {dragonIndex + 1} OF {DRAGONS.length}
                  </Text>
                  <View
                    style={[
                      styles.dragonReveal,
                      isCompact && styles.dragonRevealCompact,
                      isTiny && styles.dragonRevealTiny,
                    ]}>
                    <DragonPortrait
                      art={namingDragon.previewArt}
                      accent={namingDragon.accent}
                      level={1}
                      dragonId={namingDragon.id}
                      size={dragonPortraitSize}
                      priority="high"
                    />
                  </View>
                  <Pressable onPress={Keyboard.dismiss} accessibilityRole="none">
                    <Text style={[styles.question, isCompact && styles.questionCompact]}>
                      {isTiny ? (
                        <>Name your {namingDragon.title.toLowerCase()}</>
                      ) : (
                        <>
                          Name your{'\n'}
                          {namingDragon.title.toLowerCase()}
                        </>
                      )}
                    </Text>
                    <Text style={styles.dragonHint} numberOfLines={isTiny ? 1 : 2}>
                      Default: {namingDragon.name} · {namingDragon.motto}
                    </Text>
                  </Pressable>
                  <TextInput
                    style={[
                      styles.nameInput,
                      isCompact && styles.nameInputCompact,
                      styles.dragonNameInput,
                      textInputWeb,
                    ]}
                    value={dragonNames[namingDragon.id] ?? ''}
                    onChangeText={(text) =>
                      setDragonNames((prev) => ({ ...prev, [namingDragon.id]: text }))
                    }
                    placeholder={namingDragon.name}
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    maxLength={24}
                    returnKeyType="done"
                    blurOnSubmit
                    onFocus={scrollNameFieldIntoView}
                    onSubmitEditing={submitDragonName}
                  />
                </Animated.View>
              ) : null}

              {phase === 'benefits' ? (
                <Animated.View
                  key="benefits"
                  entering={FadeInDown.duration(380)}
                  exiting={FadeOut.duration(160)}
                  style={styles.phaseBody}>
                  <Text style={[styles.question, isCompact && styles.questionCompact]}>
                    {name.trim() ? `${name.trim()}, protein` : 'Protein'} changes everything.
                  </Text>
                  <View style={styles.benefitList}>
                    {BENEFITS.map((b, i) => (
                      <Animated.View
                        key={b}
                        entering={FadeInDown.delay(450 + i * 380).duration(420)}
                        style={styles.benefitRow}>
                        <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                        <Text style={styles.benefitText}>{b}</Text>
                      </Animated.View>
                    ))}
                  </View>
                </Animated.View>
              ) : null}

              {phase === 'manifesto' ? (
                <Animated.View
                  key="manifesto"
                  entering={FadeInDown.duration(380)}
                  exiting={FadeOut.duration(160)}
                  style={styles.phaseBody}>
                  <Animated.Text entering={FadeIn.delay(200).duration(700)} style={styles.kicker}>
                    THE GAME
                  </Animated.Text>
                  <Animated.Text
                    entering={FadeInDown.delay(350).duration(600)}
                    style={[
                      styles.question,
                      isCompact && styles.questionCompact,
                      { marginTop: spacing.sm },
                    ]}>
                    Life is a game.
                  </Animated.Text>
                  <View style={styles.manifestoList}>
                    {MANIFESTO.map((line, i) => (
                      <Animated.Text
                        key={line.lead}
                        entering={FadeInDown.delay(800 + i * 500).duration(500)}
                        style={styles.manifestoLine}>
                        <Text style={styles.manifestoLead}>{line.lead}</Text>
                        {line.rest}
                      </Animated.Text>
                    ))}
                  </View>
                </Animated.View>
              ) : null}
            </ScrollView>

            <View
              style={[
                styles.footer,
                { paddingBottom: footerGap + (phase === 'dragons' ? spacing.sm : spacing.lg) },
              ]}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {phase === 'name' ? (
                <Button title="Continue" onPress={submitName} />
              ) : phase === 'dragons' ? (
                <Button title={dragonIndex < DRAGONS.length - 1 ? 'Next dragon' : 'Continue'} onPress={submitDragonName} />
              ) : phase === 'benefits' ? (
                <Animated.View entering={FadeIn.delay(450 + BENEFITS.length * 380)}>
                  <Button title="Continue" onPress={next} />
                </Animated.View>
              ) : (
                <Animated.View entering={FadeIn.delay(800 + MANIFESTO.length * 500)}>
                  <Button
                    title="I'm ready"
                    onPress={finish}
                    loading={saving || sessionLoading}
                    disabled={sessionLoading || !session}
                  />
                </Animated.View>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: { flex: 1, width: '100%', alignSelf: 'center' },
  noPointer: { pointerEvents: 'none' },

  // Hero scene layers
  emberLayer: {
    backgroundColor: 'transparent',
    // Smooth fade-in once the video begins playing (web).
    ...(Platform.OS === 'web' ? { transition: 'opacity 600ms ease' } : {}),
  } as unknown as ViewStyle,
  emberVideo: { width: '100%', height: '100%', backgroundColor: 'transparent' },
  glow: {
    position: 'absolute',
    bottom: -160,
    alignSelf: 'center',
    width: 480,
    height: 360,
    borderRadius: 240,
    backgroundColor: colors.accent,
    // Soft-edged glow without native blur support.
    transform: [{ scaleX: 1.4 }],
    filter: Platform.OS === 'web' ? 'blur(110px)' : undefined,
    opacity: 0.2,
  },

  // Hero type
  brand: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  heroCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  titleWordWrap: { width: '100%', alignItems: 'center' },
  titleDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xl,
  },
  titleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  titleDotOn: { backgroundColor: colors.accent },
  titleDotOff: { backgroundColor: colors.ringTrack },
  heroSettled: { alignItems: 'center', gap: spacing.md, width: '100%' },
  heroWord: {
    ...noTextCaret,
    fontFamily: fonts.displayHeavy,
    fontSize: 84,
    letterSpacing: 4,
    color: colors.text,
    textAlign: 'center',
    maxWidth: '100%',
    ...(Platform.OS === 'web'
      ? { textShadow: '0 4px 24px rgba(0,0,0,0.6)' }
      : {
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowRadius: 24,
          textShadowOffset: { width: 0, height: 4 },
        }),
  },
  heroWordCompact: { fontSize: 56 },
  heroSub: {
    ...noTextCaret,
    fontFamily: fonts.displayMedium,
    fontSize: 16,
    lineHeight: 25,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  heroSubCompact: { fontSize: 14, lineHeight: 22 },
  heroFooter: { gap: spacing.md },
  heroTagline: {
    ...noTextCaret,
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Step chrome
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  backBtn: {
    width: layout.iconBtn,
    height: layout.iconBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.ringTrack,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },

  // Phase bodies — scroll so the pinned footer never covers the name field.
  phaseScroll: { flex: 1, minHeight: 0 },
  phaseScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Naming steps: top-align so short screens don't bury the TextInput under the CTA.
  phaseScrollContentNamed: {
    justifyContent: 'flex-start',
    paddingTop: spacing.md,
  },
  phaseBody: { width: '100%' },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 3.5,
    color: colors.accentSecondary,
  },
  question: {
    fontFamily: fonts.displayHeavy,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -1,
    color: colors.text,
  },
  questionCompact: { fontSize: 28, lineHeight: 35, letterSpacing: -0.5 },
  nameInput: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.accent,
    paddingVertical: spacing.sm,
    marginTop: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineBright,
  },
  nameInputCompact: { fontSize: 26 },
  dragonNameInput: { marginTop: spacing.md, marginBottom: spacing.md },
  dragonReveal: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  dragonRevealCompact: { marginTop: spacing.sm, marginBottom: spacing.sm },
  dragonRevealTiny: { marginTop: spacing.xs, marginBottom: spacing.xs },
  dragonHint: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  benefitList: { gap: spacing.lg, marginTop: spacing.xl },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  benefitText: {
    fontFamily: fonts.displayMedium,
    fontSize: 19,
    color: colors.text,
  },
  manifestoList: { gap: spacing.lg, marginTop: spacing.xl },
  manifestoLine: {
    ...noTextCaret,
    fontFamily: fonts.display,
    fontSize: 21,
    lineHeight: 28,
    color: colors.textSecondary,
  },
  manifestoLead: { color: colors.accent },

  footer: { gap: spacing.sm, paddingTop: spacing.md },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },
});
