import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ob } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Native react-native-svg does not honor SVG pathLength for dash draw.
 * Use measured path lengths so iOS/Android/web all animate the stroke.
 */
const LEN = {
  plan: 314,
  comparison: 331,
  pot: 311,
} as const;

function useReduceMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Draw-on animation matching web chart-motion draw-trend. */
function useDraw(animate: boolean, length: number, delay = 0, reduced = false) {
  const progress = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => {
    if (!animate || reduced) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 1650, easing: Easing.bezier(0.35, 0, 0.2, 1) }),
    );
  }, [animate, delay, length, reduced, progress]);
  return progress;
}

function useFadeIn(animate: boolean, delay: number, reduced: boolean) {
  const op = useSharedValue(animate && !reduced ? 0 : 1);
  useEffect(() => {
    if (!animate || reduced) {
      op.value = 1;
      return;
    }
    op.value = 0;
    op.value = withDelay(delay, withTiming(1, { duration: 250 }));
  }, [animate, delay, reduced, op]);
  return useAnimatedProps(() => ({ opacity: op.value }));
}

function GridLines() {
  return (
    <>
      {[40, 85, 130].map((y) => (
        <Line
          key={y}
          x1="12"
          x2="298"
          y1={y}
          y2={y}
          stroke={ob.border}
          strokeDasharray="2 3"
        />
      ))}
    </>
  );
}

function StrokePath({
  d,
  length,
  progress,
  stroke,
  strokeWidth = '2',
}: {
  d: string;
  length: number;
  progress: SharedValue<number>;
  stroke: string;
  strokeWidth?: string;
}) {
  const props = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));
  return (
    <AnimatedPath
      animatedProps={props}
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={`${length} ${length}`}
    />
  );
}

export function TrendChart({ animate = true }: { animate?: boolean }) {
  const reduced = useReduceMotion();
  const progress = useDraw(animate, LEN.plan, 150, reduced);
  const cmpProgress = useDraw(animate, LEN.comparison, 250, reduced);
  const endProps = useFadeIn(animate, 1600, reduced);
  const labelOp = useSharedValue(animate && !reduced ? 0 : 1);

  useEffect(() => {
    if (!animate || reduced) {
      labelOp.value = 1;
      return;
    }
    labelOp.value = 0;
    labelOp.value = withDelay(1700, withTiming(1, { duration: 300 }));
  }, [animate, reduced, labelOp]);

  const labelStyle = useAnimatedStyle(() => ({ opacity: labelOp.value }));
  // Flat ending for loss trend (handoff brief).
  const plan =
    'M12 40 C72 40 99 43 129 65 C168 94 192 128 226 137 C244 140 253 140 274 140 L296 140';
  const comparison =
    'M12 40 C76 40 105 102 139 99 C169 98 181 64 218 35 C248 12 270 9 296 15';

  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="trend-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor={ob.accent} stopOpacity="0.28" />
            <Stop offset="1" stopColor={ob.canvas} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <GridLines />
        <Path d={`${plan} L296 151 L12 151Z`} fill="url(#trend-shade)" opacity={animate && !reduced ? 0.85 : 1} />
        <StrokePath d={comparison} length={LEN.comparison} progress={cmpProgress} stroke={ob.comparison} />
        <StrokePath d={plan} length={LEN.plan} progress={progress} stroke={ob.ink} />
        <AnimatedCircle animatedProps={endProps} cx="12" cy="40" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <AnimatedCircle animatedProps={endProps} cx="296" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <Line x1="7" x2="302" y1="151" y2="151" stroke={ob.border} />
      </Svg>
      <Animated.View style={[styles.overlayLabels, labelStyle]} pointerEvents="none">
        <Text style={[styles.floatLabel, { top: 58, left: '62%' }]}>Without a plan</Text>
        <Text style={[styles.floatLabelAccent, { top: 128, left: 16 }]}>With ProteinQuest</Text>
      </Animated.View>
      <View style={styles.labels}>
        <Text style={styles.label}>Month 1</Text>
        <Text style={styles.label}>Month 6</Text>
      </View>
    </View>
  );
}

export function PotentialChart({ animate = true }: { animate?: boolean }) {
  const reduced = useReduceMotion();
  const progress = useDraw(animate, LEN.pot, 150, reduced);
  const endProps = useFadeIn(animate, 1600, reduced);
  const d = 'M12 140 C90 145 126 100 171 75 S244 28 295 25';
  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="pot-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor={ob.accent} stopOpacity="0.4" />
            <Stop offset="1" stopColor={ob.canvas} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <GridLines />
        <Path d={`${d} L295 150 L12 150Z`} fill="url(#pot-shade)" />
        <StrokePath d={d} length={LEN.pot} progress={progress} stroke={ob.ink} />
        <AnimatedCircle animatedProps={endProps} cx="12" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <AnimatedCircle animatedProps={endProps} cx="295" cy="25" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <Line x1="7" x2="302" y1="151" y2="151" stroke={ob.border} />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>3 Days</Text>
        <Text style={styles.label}>30 Days</Text>
      </View>
    </View>
  );
}

export function MaintainChart() {
  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <GridLines />
        <Path d="M12 85 L296 85 L296 150 L12 150Z" fill={ob.accent} fillOpacity={0.12} />
        <Path d="M12 85 L296 85" fill="none" stroke={ob.ink} strokeWidth="2" />
        <Circle cx="12" cy="85" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <Circle cx="296" cy="85" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <Line x1="7" x2="302" y1="151" y2="151" stroke={ob.border} />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>Now</Text>
        <Text style={styles.label}>Your goal</Text>
      </View>
    </View>
  );
}

export function ProgressChart({ animate = true }: { animate?: boolean }) {
  const reduced = useReduceMotion();
  const progress = useDraw(animate, LEN.pot, 150, reduced);
  const endProps = useFadeIn(animate, 1600, reduced);
  const d = 'M12 140 C90 145 126 100 171 75 S244 28 295 25';
  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="prog-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor={ob.accent} stopOpacity="0.35" />
            <Stop offset="1" stopColor={ob.canvas} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <GridLines />
        <Path d={`${d} L295 150 L12 150Z`} fill="url(#prog-shade)" />
        <StrokePath d={d} length={LEN.pot} progress={progress} stroke={ob.ink} />
        <AnimatedCircle animatedProps={endProps} cx="12" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <AnimatedCircle animatedProps={endProps} cx="295" cy="25" r="5" stroke={ob.ink} strokeWidth="2" fill={ob.canvas} />
        <Line x1="7" x2="302" y1="151" y2="151" stroke={ob.border} />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>Now</Text>
        <Text style={styles.label}>Your goal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%', position: 'relative' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  label: { fontSize: 11, color: ob.muted },
  overlayLabels: { ...StyleSheet.absoluteFill },
  floatLabel: { position: 'absolute', fontSize: 10, color: ob.muted2 },
  floatLabelAccent: { position: 'absolute', fontSize: 10, color: ob.accentSoft, fontWeight: '600' },
});
