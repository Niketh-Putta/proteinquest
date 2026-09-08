import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BirthdayWheels, HeightWheels } from '@/components/onboarding/BirthdayWheels';
import { PrimaryButton, TextButton, UnitToggle } from '@/components/onboarding/Controls';
import { EmailAuthModal } from '@/components/onboarding/EmailAuthModal';
import { IntroPhone } from '@/components/onboarding/IntroPhone';
import { OptionList } from '@/components/onboarding/OptionList';
import { PaceSlider } from '@/components/onboarding/PaceSlider';
import { RewardStory } from '@/components/onboarding/RewardStory';
import {
  MaintainChart,
  PotentialChart,
  ProgressChart,
  TrendChart,
} from '@/components/onboarding/TrendChart';
import { WeightInput, WeightRuler } from '@/components/onboarding/WeightRuler';
import { ob } from '@/components/onboarding/theme';
import { isRegisteredUser, signInWithSocial } from '@/lib/onboarding-auth';
import {
  buildProfileUpdatesFromAnswers,
  clearOnboardingDraft,
  guardDraftOwner,
  loadOnboardingDraft,
  markAnswersSaved,
  saveOnboardingDraft,
  wereAnswersSaved,
} from '@/lib/onboarding-draft';
import {
  INITIAL_ONBOARDING_ANSWERS,
  KG_TO_LB,
  ONBOARDING_QUESTIONS,
  dailyNutritionTargets,
  isAdult,
  nextStep,
  onboardingProgress,
  suggestedTarget,
  targetWeightConcern,
  weightBounds,
  type OnboardingAnswers,
} from '@/lib/onboarding-flow';
import { setMealRemindersEnabled } from '@/lib/meal-reminders';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';

type ModalKind =
  | ''
  | 'age'
  | 'weight-concern'
  | 'email'
  | 'terms'
  | 'privacy'
  | 'saving';

export default function Intro() {
  const { session, profile, saveProfile } = useSession();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>({ ...INITIAL_ONBOARDING_ANSWERS });
  const [history, setHistory] = useState<number[]>([]);
  const [rewardPage, setRewardPage] = useState(0);
  const [login, setLogin] = useState(false);
  const [modal, setModal] = useState<ModalKind>('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const [referral, setReferral] = useState('');
  const [planSaved, setPlanSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saving your plan…');
  const [saveFailed, setSaveFailed] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);

  const put = useCallback((key: string, value: string | number | boolean) => {
    setA((old) => ({ ...old, [key]: value }));
  }, []);

  const number = (key: string) => Number(a[key]);
  const units = String(a.weightUnit || 'kg');
  const displayed = (key: string) =>
    +(number(key) * (units === 'lbs' ? KG_TO_LB : 1)).toFixed(1);
  const delta = +(Math.abs(number('target') - number('weight'))).toFixed(1);

  const nutrition = useMemo(() => {
    try {
      return dailyNutritionTargets({
        sex: String(a.sex),
        birthday: String(a.birthday),
        heightCm: number('height'),
        weightKg: number('weight'),
        goal: String(a.goal),
        workouts: String(a.workouts),
        paceKgPerWeek: number('pace'),
        targetKg: number('target'),
      });
    } catch {
      return null;
    }
  }, [a]);

  const concern = targetWeightConcern(number('weight'), number('target'), number('height'));
  const q = ONBOARDING_QUESTIONS[step];
  const nutritionSub =
    'This will be taken into account when calculating your daily nutrition goals.';

  useEffect(() => {
    let active = true;
    (async () => {
      const draft = await loadOnboardingDraft();
      if (!active) return;
      if (draft) {
        setA({ ...INITIAL_ONBOARDING_ANSWERS, ...draft.answers });
        const rawStep = draft.step;
        const normalized =
          rawStep === 27
            ? 26
            : [20, 21].includes(rawStep)
              ? 22
              : rawStep === 23
                ? 24
                : [31, 32, 33, 34].includes(rawStep)
                  ? 30
                  : rawStep;
        setStep(normalized);
        setHistory((draft.history || []).filter((n) => ![20, 21, 23, 31, 32, 33, 34].includes(n)));
        setLogin(!!draft.login);
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void saveOnboardingDraft({ step, answers: a, history, login });
  }, [a, step, history, ready, login]);

  useEffect(() => {
    void guardDraftOwner(session?.user?.id);
  }, [session?.user?.id]);

  useEffect(() => {
    setError('');
    if (step === 27) setProgress(0);
  }, [step]);

  useEffect(() => {
    if (step !== 27) return;
    const id = setInterval(() => setProgress((p) => Math.min(100, p + 4)), 140);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step === 27 && progress >= 100) {
      setHistory((h) => [...h, 27]);
      setStep(28);
    }
  }, [progress, step]);

  const go = useCallback((n: number) => {
    if (step === 28 && n === 29 && rewardPage === 0) {
      setRewardPage(1);
      return;
    }
    setRewardPage(0);
    setHistory((h) => [...h, step]);
    const next =
      n === 20 || n === 21 ? 22 : n === 23 ? 24 : [31, 32, 33, 34].includes(n) ? 30 : n;
    setStep(next);
    setModal('');
  }, [step, rewardPage]);

  const back = useCallback(() => {
    if (step === 28 && rewardPage) {
      setRewardPage((v) => v - 1);
      return;
    }
    setRewardPage(0);
    const prev = history.filter((n) => n !== 20).at(-1) ?? Math.max(0, step - 1);
    setStep(prev);
    setHistory((h) => h.slice(0, -1));
    setModal('');
  }, [step, rewardPage, history]);

  const next = useCallback(() => {
    if (step === 3 && !isAdult(String(a.birthday))) {
      setModal('age');
      return;
    }
    if (step === 10) put('target', suggestedTarget(Number(a.weight), String(a.goal)));
    if (
      step === 11 &&
      targetWeightConcern(number('weight'), number('target'), number('height')) &&
      String(a.reviewedTarget) !== String(a.target)
    ) {
      setModal('weight-concern');
      return;
    }
    go(nextStep(step, String(a.goal)));
  }, [step, a, put, go]);

  async function persistPlan() {
    setSaveFailed(false);
    setSaveStatus('Saving your plan…');
    try {
      // Prefer live auth user over possibly-stale React session after OAuth.
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user ?? session?.user;
      if (!user || !isRegisteredUser(user)) {
        throw new Error('Sign in again to save your plan.');
      }
      if (await wereAnswersSaved(user.id, a)) {
        setSaveStatus('Plan saved to your account.');
        setPlanSaved(true);
        return;
      }
      const updates = buildProfileUpdatesFromAnswers(a, profile);
      await saveProfile(updates);
      await markAnswersSaved(user.id, a);
      await clearOnboardingDraft();
      setSaveStatus('Plan saved to your account.');
      setPlanSaved(true);
      trackEvent('onboarding_complete', { goal: String(a.goal) });
    } catch (e) {
      setSaveFailed(true);
      setSaveStatus(e instanceof Error ? e.message : 'Could not save. Your answers are still on this device.');
    }
  }

  useEffect(() => {
    if (step !== 30 || !a.auth || a.auth === 'Demo') return;
    void persistPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, saveAttempt, a.auth]);

  function finishAuth(provider: string) {
    put('auth', provider);
    if (login && profile?.intro_completed && profile?.onboarded && profile?.active_dragon_id) {
      void clearOnboardingDraft();
      router.replace('/(tabs)/today');
      return;
    }
    if (login && profile?.intro_completed && profile?.onboarded) {
      void clearOnboardingDraft();
      router.replace('/onboarding');
      return;
    }
    go(30);
  }

  async function startAuth(provider: 'Apple' | 'Google' | 'Email') {
    if (authBusy) return;
    if (!login && !a.terms) {
      setError('Please agree to the Terms and Conditions and Privacy Policy to continue.');
      return;
    }
    setError('');
    if (provider === 'Email') {
      setModal('email');
      return;
    }
    setAuthBusy(true);
    try {
      await signInWithSocial(provider === 'Apple' ? 'apple' : 'google');
      finishAuth(provider);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Sign-in could not start.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function onEmailSuccess() {
    setModal('');
    finishAuth('Email');
  }

  async function handleNotifications(allow: boolean) {
    put('notifications', allow);
    if (allow) {
      void setMealRemindersEnabled(true, profile).catch(() => {});
    } else {
      void setMealRemindersEnabled(false, profile).catch(() => {});
    }
    go(25);
  }

  async function handleTryNow() {
    if (!planSaved && a.auth && a.auth !== 'Demo') {
      setError('Saving your plan first…');
      setSaveAttempt((v) => v + 1);
      return;
    }
    trackEvent('onboarding_complete');
    const dragonId = profile?.active_dragon_id;
    if (!dragonId) {
      router.replace('/onboarding');
      return;
    }
    router.replace('/(tabs)/today');
  }

  if (!ready) {
    return <View style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]} />;
  }

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  const heading = (title: string, sub?: string) => (
    <View style={styles.heading}>
      <Text style={styles.h1}>{title}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );

  if (step === 28 && rewardPage > 0) {
    body = <RewardStory page={rewardPage === 1 ? 1 : 2} />;
    footer = (
      <PrimaryButton
        label={rewardPage === 1 ? 'Make it rewarding' : 'Let’s build my streak'}
        onPress={() => {
          if (rewardPage === 1) setRewardPage(2);
          else go(29);
        }}
      />
    );
  } else if (q) {
    body = (
      <>
        {heading(q.title, q.sub)}
        <OptionList
          options={q.options}
          value={String(a[q.key] ?? '')}
          onChange={(v) => put(q.key, v)}
          long={q.options.length > 5}
        />
      </>
    );
    footer = (
      <PrimaryButton label="Continue" onPress={next} disabled={!a[q.key]} />
    );
  } else {
    switch (step) {
      case 0:
        body = (
          <>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>ProteinQuest</Text>
              <Text style={styles.brandLang}>EN</Text>
            </View>
            <IntroPhone />
            <Text style={styles.welcomeTitle}>
              Calorie tracking{'\n'}made easy
            </Text>
          </>
        );
        footer = (
          <>
            <PrimaryButton label="Get Started" onPress={next} />
            <TextButton
              label={
                <Text style={styles.textBtn}>
                  Already have an account? <Text style={styles.bold}>Sign In</Text>
                </Text>
              }
              onPress={() => {
                setLogin(true);
                go(29);
              }}
            />
          </>
        );
        break;
      case 3: {
        body = (
          <>
            {heading('When were you born?', nutritionSub)}
            <BirthdayWheels birthday={String(a.birthday)} onChange={(v) => put('birthday', v)} />
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      }
      case 6:
        body = (
          <>
            {heading('Designed to help you stay on track')}
            <View style={[styles.softCard, styles.centeredCard]}>
              <Text style={styles.cardLead}>Weight trend</Text>
              <TrendChart animate />
              <Text style={styles.caption}>
                Track your habits and stay{'\n'}consistent over time.
              </Text>
            </View>
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 7:
        body = (
          <>
            {heading('What is your height?', nutritionSub)}
            <UnitToggle
              options={['ft, in', 'cm']}
              value={String(a.heightUnit)}
              onChange={(v) => put('heightUnit', v)}
            />
            <HeightWheels
              heightCm={number('height')}
              unit={String(a.heightUnit)}
              onChange={(v) => put('height', v)}
            />
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 8:
      case 11: {
        const key = step === 8 ? 'weight' : 'target';
        const { min, max } = weightBounds(number('weight'), String(a.goal), step === 8);
        body = (
          <>
            {heading(
              step === 8 ? 'What is your weight?' : 'What is your desired weight?',
              step === 8 ? nutritionSub : undefined,
            )}
            {step === 8 ? (
              <UnitToggle
                options={['lbs', 'kg']}
                value={units}
                onChange={(v) => put('weightUnit', v)}
              />
            ) : null}
            <View style={styles.weightControl}>
              <Text style={styles.weightLabel}>{step === 8 ? 'Current weight' : String(a.goal)}</Text>
              <View style={styles.weightValue}>
                <WeightInput
                  label={step === 8 ? 'Current weight' : 'Desired weight'}
                  value={number(key)}
                  unit={units}
                  min={min}
                  max={max}
                  onChange={(v) => put(key, v)}
                />
                <Text style={styles.weightUnit}>{units}</Text>
              </View>
              <WeightRuler
                value={number(key)}
                unit={units}
                min={min}
                max={max}
                onChange={(v) => put(key, v)}
              />
              <Text style={styles.hint}>Scroll the scale or tap the number</Text>
            </View>
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      }
      case 12:
        body = (
          <View style={styles.centerMsg}>
            <Text style={styles.h1}>
              {a.goal === 'Lose weight' ? 'Losing' : 'Gaining'}{' '}
              <Text style={styles.em}>{delta} kg</Text> starts with a plan!
            </Text>
            <Text style={styles.centerSub}>
              To help you make steady progress, we’ll create a personalized plan based on your
              habits, goals, and timeline.
            </Text>
          </View>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 13:
        body = (
          <>
            {heading('How fast do you want to reach your goal?')}
            <View style={styles.pace}>
              <Text style={styles.paceLabel}>
                Weight {a.goal === 'Lose weight' ? 'loss' : 'gain'} speed per week
              </Text>
              <Text style={styles.paceValue}>{number('pace').toFixed(1)} kg</Text>
              <PaceSlider value={number('pace')} onChange={(v) => put('pace', v)} />
              <View style={[styles.softCard, styles.paceNote]}>
                <Text style={styles.paceReach}>
                  You should reach your goal in{' '}
                  <Text style={styles.em}>{Math.ceil(delta / Math.max(0.1, number('pace')) * 7)} days</Text>
                </Text>
                <Text style={styles.paceHint}>
                  {number('pace') < 0.3
                    ? 'Going slow means a gentler and more sustainable goal.'
                    : number('pace') > 0.6
                      ? 'This pace moves quickly; staying consistent will be key.'
                      : 'This is the most balanced pace, motivating and ideal for most users.'}
                </Text>
                <Text style={styles.hint}>Illustrative estimate</Text>
              </View>
            </View>
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 14:
        body = (
          <>
            {heading(
              'A simpler way to stay on track',
              'Log meals in seconds, follow your plan, and see your progress add up.',
            )}
            <View style={[styles.softCard, styles.consistency]}>
              <View style={styles.barPair}>
                <View style={styles.barCol}>
                  <Text style={styles.barLabel}>Without{'\n'}ProteinQuest</Text>
                  <View style={[styles.bar, styles.barShort]}>
                    <Ionicons name="people-outline" size={18} color="#fff" />
                  </View>
                </View>
                <View style={styles.barCol}>
                  <Text style={styles.barLabel}>With{'\n'}ProteinQuest</Text>
                  <View style={[styles.bar, styles.barTall]}>
                    <Ionicons name="heart" size={18} color="#fff" />
                  </View>
                </View>
              </View>
              <Text style={styles.checkLine}>
                <Ionicons name="checkmark" size={14} color={ob.ink} /> Small daily actions lead to
                progress
              </Text>
            </View>
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 18:
        body = (
          <>
            {heading('You have great potential to crush your goal')}
            <View style={[styles.softCard, styles.centeredCard]}>
              <Text style={styles.cardLead}>Your weight transition</Text>
              <PotentialChart animate />
              <Text style={styles.caption}>
                Weight change takes time. Consistency in{'\n'}the early weeks matters most
              </Text>
            </View>
          </>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 19:
        body = (
          <View style={styles.trust}>
            <View style={styles.pastelRing}>
              <Ionicons name="hand-left-outline" size={64} color={ob.accent} />
            </View>
            <Text style={styles.h1}>
              Thank you for{'\n'}trusting us!
            </Text>
            <Text style={styles.trustSub}>Now let’s personalize ProteinQuest for you...</Text>
            <View style={styles.softCard}>
              <Ionicons name="lock-closed-outline" size={24} color={ob.ink} />
              <Text style={styles.cardTitle}>Personalized to your goals</Text>
              <Text style={styles.cardSmall}>
                We’ll use your answers to tailor your plan, targets, and recommendations.
              </Text>
            </View>
          </View>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 22:
        body = (
          <>
            {heading('Rollover extra calories to the next day?')}
            <Text style={styles.rollSub}>
              Rollover up to <Text style={styles.em}>200 cals</Text>
            </Text>
            <View style={styles.rollover}>
              {['Yesterday', 'Today'].map((d, i) => (
                <View key={d} style={[styles.calCard, i === 1 && styles.calCardToday]}>
                  <Text style={styles.calDay}>
                    <Ionicons name="flame" size={14} color={ob.accent} /> {d}
                  </Text>
                  <Text style={styles.calBig}>
                    2350<Text style={styles.calMax}>/2500</Text>
                  </Text>
                  {i === 1 ? <Text style={styles.blueChip}>↻ +150</Text> : null}
                  <View style={styles.calCircle}>
                    <Text style={styles.calLeft}>
                      Cals left{'\n'}
                      {i ? '150 + 150' : '150'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        );
        footer = (
          <>
            <PrimaryButton
              label="Yes"
              onPress={() => {
                put('rollover', true);
                go(24);
              }}
            />
            <TextButton
              label="No"
              onPress={() => {
                put('rollover', false);
                go(24);
              }}
            />
          </>
        );
        break;
      case 24:
        body = (
          <View style={styles.notification}>
            <Text style={styles.h1}>Stay on track with ProteinQuest notifications</Text>
            <View style={styles.nativeNotif}>
              <Text style={styles.nativeTitle}>
                ProteinQuest would like to send you Notifications
              </Text>
              <View style={styles.nativeActions}>
                <Pressable style={styles.nativeBtn} onPress={() => handleNotifications(false)}>
                  <Text style={styles.nativeBtnText}>Don’t Allow</Text>
                </Pressable>
                <Pressable style={styles.nativeBtn} onPress={() => handleNotifications(true)}>
                  <Text style={[styles.nativeBtnText, styles.bold]}>Allow</Text>
                </Pressable>
              </View>
            </View>
          </View>
        );
        break;
      case 25:
        body = (
          <>
            {heading('Enter promo code (optional)', 'You can skip this step')}
            <View style={styles.referral}>
              <TextInput
                accessibilityLabel="Promo code"
                placeholder="Promo Code"
                placeholderTextColor="#b0abb6"
                value={referral}
                onChangeText={(t) => {
                  setReferral(t);
                  put('referral', '');
                  setError('');
                }}
                autoCapitalize="characters"
                style={styles.referralInput}
              />
              <Pressable
                disabled={!referral.trim()}
                onPress={() => {
                  if (referral.trim().toUpperCase() === 'PROTEINQUEST') {
                    put('referral', referral.trim().toUpperCase());
                    setError('Code applied successfully.');
                  } else {
                    setError('This code isn’t valid. Try PROTEINQUEST.');
                  }
                }}
                style={[styles.referralSubmit, !referral.trim() && { opacity: 0.4 }]}>
                <Text style={styles.referralSubmitText}>Submit</Text>
              </Pressable>
            </View>
            {error ? <Text style={styles.inputMessage}>{error}</Text> : null}
          </>
        );
        footer = (
          <PrimaryButton label={a.referral ? 'Continue' : 'Skip'} onPress={next} />
        );
        break;
      case 26:
        body = (
          <View style={[styles.trust, styles.ready]}>
            <View style={styles.pastelRing}>
              <Ionicons name="heart" size={72} color={ob.accent} />
            </View>
            <Text style={styles.allDone}>
              <Ionicons name="checkmark-circle" size={16} color={ob.ink} /> All done!
            </Text>
            <Text style={styles.h1}>
              Time to generate{'\n'}your custom plan!
            </Text>
          </View>
        );
        footer = <PrimaryButton label="Continue" onPress={next} />;
        break;
      case 27:
        body = (
          <View style={styles.generating}>
            <Text style={styles.genPct}>{progress}%</Text>
            <Text style={styles.h1}>
              We’re setting{'\n'}everything up for you
            </Text>
            <View style={styles.genTrack}>
              <View style={[styles.genFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.genStatus}>
              {progress < 30
                ? 'Customizing health plan...'
                : progress < 60
                  ? 'Applying BMR formula...'
                  : progress < 85
                    ? 'Estimating your metabolic age...'
                    : 'Finalizing results...'}
            </Text>
            <View style={styles.genList}>
              <Text style={styles.genListLead}>Daily recommendation for</Text>
              {['Calories', 'Carbs', 'Protein', 'Fats', 'Health Score'].map((v, i) => (
                <Text key={v} style={styles.genItem}>
                  · {v}{' '}
                  {progress > 18 + i * 17 ? (
                    <Ionicons name="checkmark-circle" size={16} color={ob.accent} />
                  ) : null}
                </Text>
              ))}
            </View>
          </View>
        );
        break;
      case 28: {
        const chart =
          a.goal === 'Lose weight' ? (
            <TrendChart animate={false} />
          ) : a.goal === 'Maintain' ? (
            <MaintainChart />
          ) : (
            <ProgressChart animate={false} />
          );
        body = (
          <>
            <View style={styles.resultHeading}>
              <Ionicons name="checkmark-circle" size={28} color={ob.accent} />
              <Text style={styles.h1}>
                {a.goal === 'Maintain'
                  ? 'Your plan to maintain your weight'
                  : `Goal: ${a.goal === 'Lose weight' ? 'lose' : 'gain'} ${delta} kg`}
              </Text>
            </View>
            <View style={[styles.softCard, styles.resultCard]}>
              <Text style={styles.cardTitle}>Estimated progress</Text>
              {chart}
            </View>
            <View style={[styles.softCard, styles.resultCard]}>
              <Text style={styles.cardTitle}>Your daily recommendation</Text>
              <Text style={styles.cardSmall}>
                Starting estimates based on your body, activity and goal. Adjust with your progress.
              </Text>
              <View style={styles.macroGrid}>
                <View style={styles.macro}>
                  <Ionicons name="flame" size={22} color={ob.accent} />
                  <Text style={styles.macroVal}>
                    {nutrition ? nutrition.calories : '—'}
                  </Text>
                  <Text style={styles.macroLabel}>Calories</Text>
                </View>
                <View style={styles.macro}>
                  <Ionicons name="nutrition" size={22} color={ob.ink} />
                  <Text style={styles.macroVal}>
                    {nutrition ? `${nutrition.protein}g` : '—'}
                  </Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
              </View>
            </View>
            <View style={[styles.softCard, styles.resultCard]}>
              <Text style={styles.cardTitle}>Your info</Text>
              {[
                ['Starting weight', `${displayed('weight')} ${units}`],
                ['Goal weight', `${displayed('target')} ${units}`],
                ['Height', `${Math.round(number('height'))} cm`],
                ['Activity', `${String(a.workouts || '3–5')} workouts / week`],
                ['Diet', String(a.diet || 'Balanced')],
              ].map(([k, v]) => (
                <View key={k} style={styles.dlRow}>
                  <Text style={styles.dt}>{k}</Text>
                  <Text style={styles.dd}>{v}</Text>
                </View>
              ))}
            </View>
            {!nutrition ? (
              <Text style={styles.alert} role="alert">
                Review your age, height, current and target weights, and pace (0–1 kg/week) before
                continuing.
              </Text>
            ) : null}
          </>
        );
        footer = (
          <PrimaryButton
            label="Let’s get started!"
            onPress={() => go(29)}
            disabled={!nutrition}
          />
        );
        break;
      }
      case 29:
        body = (
          <>
            {heading(login ? 'Welcome back' : 'Save your progress')}
            <View style={styles.auth}>
              <Pressable
                style={[styles.authBtn, styles.appleBtn]}
                disabled={authBusy}
                onPress={() => startAuth('Apple')}>
                <Ionicons name="logo-apple" size={22} color="#fff" />
                <Text style={styles.authBtnTextLight}>Sign in with Apple</Text>
              </Pressable>
              <Pressable
                style={[styles.authBtn, styles.outlineBtn]}
                disabled={authBusy}
                onPress={() => startAuth('Google')}>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.authBtnText}>Sign in with Google</Text>
              </Pressable>
              <Pressable
                style={[styles.authBtn, styles.outlineBtn]}
                disabled={authBusy}
                onPress={() => startAuth('Email')}>
                <Ionicons name="mail-outline" size={20} color={ob.ink} />
                <Text style={styles.authBtnText}>Continue with email</Text>
              </Pressable>
              {__DEV__ ? (
                <Pressable
                  style={styles.demoBypass}
                  onPress={() => {
                    put('auth', 'Demo');
                    go(30);
                  }}>
                  <Text style={styles.demoBypassText}>Continue through demo (__DEV__)</Text>
                </Pressable>
              ) : null}
              {!login ? (
                <>
                  <Pressable
                    style={styles.checkRow}
                    onPress={() => put('terms', !a.terms)}>
                    <Ionicons
                      name={a.terms ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={ob.ink}
                    />
                    <Text style={styles.checkText}>
                      I agree to ProteinQuest’s{' '}
                      <Text style={styles.link} onPress={() => setModal('terms')}>
                        Terms
                      </Text>{' '}
                      and{' '}
                      <Text style={styles.link} onPress={() => setModal('privacy')}>
                        Privacy Policy
                      </Text>
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.checkRow}
                    onPress={() => put('marketing', !a.marketing)}>
                    <Ionicons
                      name={a.marketing ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={ob.ink}
                    />
                    <Text style={styles.checkText}>
                      Send me tips, new features, and personalized offers
                    </Text>
                  </Pressable>
                </>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </>
        );
        break;
      case 30:
        body = (
          <>
            <Text style={styles.trialTitle}>
              Your plan is ready.{'\n'}Start using ProteinQuest
            </Text>
            <IntroPhone />
            {a.auth && a.auth !== 'Demo' ? (
              <View style={styles.saveBox}>
                <Text style={styles.saveStatus}>{saveStatus}</Text>
                {saveFailed ? (
                  <PrimaryButton label="Retry saving" onPress={() => setSaveAttempt((v) => v + 1)} />
                ) : null}
              </View>
            ) : (
              <Text style={styles.demoNote}>Demo only. Your answers are saved on this device.</Text>
            )}
          </>
        );
        footer = (
          <PrimaryButton
            label="Try Now"
            onPress={handleTryNow}
            disabled={!!(a.auth && a.auth !== 'Demo' && !planSaved)}
          />
        );
        break;
      default:
        body = (
          <View style={styles.centerMsg}>
            <Text style={styles.h1}>Continue</Text>
            <PrimaryButton label="Continue" onPress={next} />
          </View>
        );
    }
  }

  const showNav = step > 0 && step !== 27 && step !== 30;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {showNav ? (
        <View style={styles.nav}>
          <Pressable onPress={back} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={ob.ink} />
          </Pressable>
          {step < 30 ? (
            <View style={styles.topProgress}>
              <View style={[styles.topFill, { width: `${onboardingProgress(step)}%` }]} />
            </View>
          ) : null}
        </View>
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}

      <EmailAuthModal
        visible={modal === 'email'}
        login={login}
        onClose={() => setModal('')}
        onSuccess={onEmailSuccess}
      />

      <Modal
        visible={modal === 'age' || modal === 'weight-concern' || modal === 'terms' || modal === 'privacy'}
        transparent
        animationType="fade"
        onRequestClose={() => setModal('')}>
        <Pressable style={styles.modalBackdrop} onPress={() => setModal('')}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {modal === 'age'
                ? 'We’re sorry!'
                : modal === 'weight-concern'
                  ? 'Let’s review that goal'
                  : modal === 'privacy'
                    ? 'Privacy Policy'
                    : 'Terms and Conditions'}
            </Text>
            <Text style={styles.modalBody}>
              {modal === 'age'
                ? 'You must be at least 18 years old to use ProteinQuest.'
                : modal === 'weight-concern'
                  ? `That target is a ${Math.round(concern?.changePercent || 0)}% change from your current weight and looks unusually far from a typical range for your height. ProteinQuest can help you track progress, but it cannot confirm that this target is safe. Consider a more moderate target or speak with a qualified healthcare professional.`
                  : modal === 'privacy'
                    ? 'Draft answers are stored on this device. When you complete sign-up, your submitted answers and nutrition targets are saved to your account. See the in-app Privacy screen for full details.'
                    : 'By continuing you agree to ProteinQuest’s terms of use. See the in-app Terms screen for full details.'}
            </Text>
            {modal === 'age' ? (
              <PrimaryButton label="OK" onPress={() => setModal('')} />
            ) : null}
            {modal === 'weight-concern' ? (
              <>
                <PrimaryButton label="Adjust my target" onPress={() => setModal('')} />
                <TextButton
                  label="Keep this target"
                  onPress={() => {
                    put('reviewedTarget', String(a.target));
                    setModal('');
                    go(12);
                  }}
                />
              </>
            ) : null}
            {(modal === 'terms' || modal === 'privacy') && (
              <PrimaryButton
                label="Close"
                onPress={() => {
                  if (modal === 'terms') router.push('/terms');
                  else if (modal === 'privacy') router.push('/privacy');
                  setModal('');
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: ob.canvas },
  nav: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#f8f7fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topProgress: { flex: 1, height: 2, backgroundColor: ob.track, borderRadius: 1, overflow: 'hidden' },
  topFill: { height: '100%', backgroundColor: '#201e25' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 23, paddingTop: 12, paddingBottom: 18, flexGrow: 1 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fdfdfd',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    gap: 0,
  },
  heading: { marginBottom: 4 },
  h1: {
    fontSize: 29,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: -0.85,
    color: ob.inkSoft,
  },
  sub: { fontSize: 14, color: ob.muted, lineHeight: 18, marginTop: 11, letterSpacing: -0.2 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  brand: { fontSize: 15, fontWeight: '600', letterSpacing: -0.4, color: ob.ink },
  brandLang: { fontSize: 11, color: ob.muted },
  welcomeTitle: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.85,
    color: ob.inkSoft,
    lineHeight: 38,
    paddingBottom: 2,
  },
  softCard: { backgroundColor: ob.card, borderRadius: 18, padding: 20 },
  centeredCard: { marginVertical: 24, minHeight: 280, paddingVertical: 26 },
  cardLead: { marginBottom: 20, fontSize: 16, color: ob.ink },
  caption: { textAlign: 'center', fontSize: 13, lineHeight: 18, color: ob.muted2, marginTop: 20 },
  weightControl: { alignItems: 'center', marginTop: 40 },
  weightLabel: { fontSize: 14, color: '#939196', marginBottom: 8 },
  weightValue: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  weightUnit: { fontSize: 31, fontWeight: '600', color: ob.ink },
  hint: { color: '#bab6bd', fontSize: 10, marginTop: 4 },
  centerMsg: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  centerSub: { fontSize: 16, color: '#99969c', lineHeight: 22, marginTop: 14, textAlign: 'center' },
  em: { color: ob.accent, fontWeight: '600', fontStyle: 'normal' },
  pace: { marginTop: 28, alignItems: 'center' },
  paceLabel: { fontSize: 14, color: ob.ink },
  paceValue: { fontSize: 32, fontWeight: '600', marginVertical: 12, color: ob.ink },
  paceNote: { marginTop: 28, width: '100%' },
  paceReach: { fontSize: 15, color: ob.ink, marginBottom: 8 },
  paceHint: { fontSize: 13, color: ob.muted, lineHeight: 18 },
  consistency: { marginTop: 20 },
  barPair: { flexDirection: 'row', gap: 16, justifyContent: 'flex-end', minHeight: 160 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barLabel: { fontSize: 12, textAlign: 'center', color: ob.muted, marginBottom: 8 },
  bar: {
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ob.ink,
  },
  barShort: { height: 70, opacity: 0.45 },
  barTall: { height: 140 },
  checkLine: { marginTop: 16, fontSize: 13, color: ob.ink },
  trust: { alignItems: 'center', paddingTop: 20, gap: 12 },
  ready: { paddingTop: 40 },
  pastelRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 18,
    borderColor: '#efe8f2',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf7fc',
    marginBottom: 8,
  },
  trustSub: { fontSize: 14, color: ob.muted, textAlign: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: ob.ink, marginTop: 8 },
  cardSmall: { fontSize: 12, color: '#8d8395', lineHeight: 18, marginTop: 6 },
  allDone: { fontSize: 14, color: ob.ink, fontWeight: '600' },
  rollSub: { fontSize: 14, color: ob.muted, marginTop: 8 },
  rollover: { flexDirection: 'row', gap: 10, marginTop: 24 },
  calCard: {
    flex: 1,
    backgroundColor: ob.card,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  calCardToday: { borderWidth: 1.5, borderColor: ob.ink },
  calDay: { fontSize: 12, color: ob.muted },
  calBig: { fontSize: 22, fontWeight: '700', color: ob.ink },
  calMax: { fontSize: 12, fontWeight: '400', color: ob.muted },
  blueChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#e8f0fe',
    color: ob.chip,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  calCircle: {
    marginTop: 8,
    borderRadius: 40,
    backgroundColor: '#fff',
    padding: 12,
    alignItems: 'center',
  },
  calLeft: { fontSize: 11, textAlign: 'center', color: ob.ink, fontWeight: '600' },
  notification: { flex: 1, justifyContent: 'center', paddingVertical: 40 },
  nativeNotif: {
    marginTop: 40,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: ob.border,
  },
  nativeTitle: { fontSize: 15, fontWeight: '600', color: ob.ink, textAlign: 'center' },
  nativeActions: { flexDirection: 'row', marginTop: 18, borderTopWidth: 1, borderTopColor: '#eee' },
  nativeBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  nativeBtnText: { fontSize: 15, color: '#3b82f6' },
  referral: { flexDirection: 'row', gap: 8, marginTop: 28 },
  referralInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e4dfea',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: ob.ink,
    backgroundColor: '#fff',
  },
  referralSubmit: {
    backgroundColor: ob.ink,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  referralSubmitText: { color: '#fff', fontWeight: '600' },
  inputMessage: { marginTop: 10, fontSize: 12, color: ob.muted },
  generating: { alignItems: 'center', paddingTop: 40, gap: 12 },
  genPct: { fontSize: 56, fontWeight: '700', color: ob.ink, letterSpacing: -2 },
  genTrack: {
    width: '100%',
    height: 4,
    backgroundColor: ob.track,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  genFill: { height: '100%', backgroundColor: ob.ink },
  genStatus: { fontSize: 14, color: ob.muted, marginTop: 8 },
  genList: { alignSelf: 'stretch', marginTop: 24, gap: 10 },
  genListLead: { fontSize: 13, color: ob.muted, marginBottom: 4 },
  genItem: { fontSize: 15, color: ob.ink },
  resultHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  resultCard: { marginBottom: 12 },
  macroGrid: { flexDirection: 'row', gap: 12, marginTop: 14 },
  macro: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  macroVal: { fontSize: 24, fontWeight: '700', color: ob.ink },
  macroLabel: { fontSize: 12, color: ob.muted },
  dlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8e6eb',
  },
  dt: { fontSize: 13, color: ob.muted },
  dd: { fontSize: 13, color: ob.ink, fontWeight: '600' },
  alert: { color: ob.danger, fontSize: 12, marginTop: 8, lineHeight: 16 },
  auth: { gap: 12, marginTop: 20 },
  authBtn: {
    minHeight: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  appleBtn: { backgroundColor: '#000' },
  outlineBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4dfea' },
  authBtnTextLight: { color: '#fff', fontSize: 15, fontWeight: '600' },
  authBtnText: { color: ob.ink, fontSize: 15, fontWeight: '600' },
  googleG: { fontSize: 18, fontWeight: '700', color: '#4285F4' },
  demoBypass: { paddingVertical: 10, alignItems: 'center' },
  demoBypassText: { fontSize: 12, color: ob.muted },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 4 },
  checkText: { flex: 1, fontSize: 12, color: ob.muted, lineHeight: 17 },
  link: { color: ob.ink, textDecorationLine: 'underline' },
  error: { fontSize: 11, color: ob.danger, lineHeight: 16 },
  trialTitle: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    color: ob.inkSoft,
    marginTop: 24,
    marginBottom: 8,
    lineHeight: 34,
  },
  saveBox: { marginTop: 12, gap: 8 },
  saveStatus: { textAlign: 'center', fontSize: 13, color: ob.muted },
  demoNote: { textAlign: 'center', fontSize: 12, color: ob.muted, marginTop: 8 },
  textBtn: { fontSize: 13, color: ob.ink },
  bold: { fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#0006',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 23,
    padding: 25,
    gap: 12,
  },
  modalTitle: { fontSize: 21, fontWeight: '600', color: '#211b27' },
  modalBody: { fontSize: 13, color: '#928996', lineHeight: 20 },
});
