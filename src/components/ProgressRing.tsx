import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, displayLH, fonts, type } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export function ProgressRing({ consumed, goal, size = 264 }: Props) {
  const strokeWidth = 2;
  const r = (size - strokeWidth * 2) / 2;
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
  const scale = size / 264;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.hairline}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={hitGoal ? colors.accent : colors.text}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.label, { fontSize: 10 * scale, lineHeight: 14 * scale }]}>
        PROTEIN TODAY
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        <Text
          style={[
            styles.consumed,
            { fontSize: 72 * scale, lineHeight: displayLH(72 * scale) },
          ]}>
          {Math.round(consumed)}
        </Text>
        <Text
          style={[
            styles.unit,
            {
              fontSize: 24 * scale,
              lineHeight: displayLH(24 * scale),
              marginBottom: 10 * scale,
            },
          ]}>
          g
        </Text>
      </View>
      <Text style={[styles.goalLine, { fontSize: 11 * scale }]}>
        {hitGoal
          ? 'goal complete'
          : goal > 0
            ? consumed === 0
              ? `0 of ${goal}g`
              : `${Math.round(remaining)}g remaining`
            : 'set your goal'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.eyebrow,
    marginBottom: 4,
  },
  consumed: {
    fontFamily: fonts.displayHeavy,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -3,
  },
  unit: {
    fontFamily: fonts.display,
    color: colors.textTertiary,
  },
  goalLine: {
    fontFamily: fonts.mono,
    letterSpacing: 0.3,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
