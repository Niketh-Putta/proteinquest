import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useLayout, usePinnedFooterGap } from '@/lib/layout';
import { useSession } from '@/lib/session';
import { setPreferredName } from '@/lib/xp';
import { colors, fonts, noTextCaret, pressableWeb, spacing, textInputWeb } from '@/theme';

const HERO_ART = require('@/assets/character/dragons/fire-5.png');
const EMBERS_VIDEO = require('@/assets/video/embers.mp4');

type Phase = 'hero' | 'name' | 'benefits' | 'manifesto';

const PHASES: Phase[] = ['hero', 'name', 'benefits', 'manifesto'];

/** Cinematic opening title sequence: each word holds, then yields to the next. */
const TITLE_WORDS = ['EAT.', 'TRAIN.', 'EVOLVE.'];
const WORD_HOLD_MS = 1450;

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

/** Slow Ken Burns drift + lateral parallax on the full-bleed hero art. */
function KenBurnsHero() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 18000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(t.value, [0, 1], [1.08, 1.22]) },
      { translateX: interpolate(t.value, [0, 1], [0, -18]) },
      { translateY: interpolate(t.value, [0, 1], [0, -10]) },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image source={HERO_ART} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

/** Looping ember-spark video overlay (black bg blends into the dark scene). */
function EmberOverlay() {
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

/** One word of the opening title: tracking-in + rise, then dissolve. */
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
  useEffect(() => {
    p.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    letterSpacing: interpolate(p.value, [0, 1], [18, 4]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [26, 0]) },
      { scale: interpolate(p.value, [0, 1], [1.06, 1]) },
    ],
  }));

  // Layout animation lives on the wrapper so it never fights the opacity worklet.
  return (
    <Animated.View exiting={FadeOut.duration(420)} style={styles.titleWordWrap}>
      <Animated.Text
        style={[styles.heroWord, compact && styles.heroWordCompact, sizeStyle, style]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {word}
      </Animated.Text>
    </Animated.View>
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
  const { horizontalPad, contentMaxWidth, height, width, isDesktop } = useLayout();
  const isCompact = height < 700 || width < 390;
  const footerGap = usePinnedFooterGap(isCompact);

  const [phase, setPhase] = useState<Phase>('hero');
  const [wordIndex, setWordIndex] = useState(0);
  const [titleDone, setTitleDone] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phaseIndex = PHASES.indexOf(phase);

  // Opening title sequence: EAT. TRAIN. EVOLVE. → settle on the brand statement.
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
    return { fontSize: base, lineHeight: Math.round(base * 1.1) };
  }, [width, isDesktop]);

  function next() {
    setError(null);
    setPhase(PHASES[Math.min(phaseIndex + 1, PHASES.length - 1)]);
  }

  function back() {
    setError(null);
    if (phaseIndex > 0) setPhase(PHASES[phaseIndex - 1]);
  }

  async function submitName() {
    if (name.trim()) await setPreferredName(name);
    next();
  }

  async function finish() {
    if (sessionLoading || !session) {
      setError('Still connecting — please wait a moment and try again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        intro_completed: true,
        ...(name.trim() ? { display_name: name.trim() } : {}),
      });
      router.replace('/onboarding');
    } catch (e: unknown) {
      if (__DEV__ && e) console.error('[intro] saveProfile failed:', e);
      setError(e instanceof Error ? e.message : 'Could not save progress');
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
              { paddingHorizontal: horizontalPad, maxWidth: contentMaxWidth },
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
                <TitleWord
                  key={TITLE_WORDS[wordIndex]}
                  word={TITLE_WORDS[wordIndex]}
                  compact={isCompact}
                  sizeStyle={heroType}
                />
              ) : (
                <Animated.View entering={FadeIn.duration(700)} style={styles.heroSettled}>
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
                </Animated.View>
              )}
            </View>

            <Animated.View
              entering={FadeInDown.delay(900).duration(800)}
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
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View
            style={[
              styles.inner,
              { paddingHorizontal: horizontalPad, maxWidth: contentMaxWidth },
            ]}>
            <View style={styles.topBar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={back}
                hitSlop={8}
                style={[styles.backBtn, pressableWeb]}>
                <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
              </Pressable>
              <PhaseProgress index={phaseIndex} total={PHASES.length} />
              <View style={styles.backBtn} />
            </View>

            {phase === 'name' ? (
              <Animated.View
                key="name"
                entering={FadeInDown.duration(380)}
                exiting={FadeOut.duration(160)}
                style={styles.phaseBody}>
                <Text style={[styles.question, isCompact && styles.questionCompact]}>
                  What should{'\n'}we call you?
                </Text>
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
                  onSubmitEditing={submitName}
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
                  style={[styles.question, isCompact && styles.questionCompact, { marginTop: spacing.sm }]}>
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

            <View style={[styles.footer, { paddingBottom: footerGap }]}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {phase === 'name' ? (
                <Button title="Continue" onPress={submitName} />
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
    width: 36,
    height: 36,
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

  // Phase bodies
  phaseBody: { flex: 1, justifyContent: 'center' },
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
