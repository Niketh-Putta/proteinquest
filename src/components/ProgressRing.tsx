import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors, fonts } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function ProgressRing({ consumed, goal, size = 264 }: Props) {
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      250,
      withTiming(pct, { duration: 1100, easing: Easing.out(Easing.cubic) }),
    );
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const remaining = Math.max(goal - consumed, 0);
  const hitGoal = goal > 0 && consumed >= goal;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* soft glow disc behind the ring */}
      <View
        style={[
          styles.glow,
          {
            width: size * 0.92,
            height: size * 0.92,
            borderRadius: size,
            opacity: hitGoal ? 0.5 : 0.22,
          },
        ]}
      />
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} />
            <Stop offset="1" stopColor="#8FD13A" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.ringTrack}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.label}>PROTEIN TODAY</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.consumed}>{Math.round(consumed)}</Text>
        <Text style={styles.unit}>g</Text>
      </View>
      <Text style={styles.goalLine}>
        {hitGoal ? 'goal complete' : `${Math.round(remaining)}g to ${goal}g`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: colors.accentGlow,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  consumed: {
    fontSize: 76,
    lineHeight: 80,
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 30,
    fontFamily: fonts.display,
    color: colors.accent,
    marginLeft: 2,
  },
  goalLine: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginTop: 6,
  },
});
