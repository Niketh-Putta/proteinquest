import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop, Text as SvgText } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ob } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function useDraw(animate: boolean) {
  const progress = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [animate, progress]);
  return progress;
}

export function TrendChart({ animate = true }: { animate?: boolean }) {
  const progress = useDraw(animate);
  const plan =
    'M12 40 C72 40 99 43 129 65 C168 94 192 128 226 137 C244 140 253 140 274 140 L296 140';
  const comparison =
    'M12 40 C76 40 105 102 139 99 C169 98 181 64 218 35 C248 12 270 9 296 15';
  const planProps = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));
  const cmpProps = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));

  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="trend-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor="#d3d1d9" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#f7f6fa" stopOpacity="0.1" />
          </LinearGradient>
        </Defs>
        {[40, 85, 130].map((y) => (
          <Line key={y} x1="12" x2="298" y1={y} y2={y} stroke="#dfdde1" strokeDasharray="2 3" />
        ))}
        <Path d={`${plan} L296 151 L12 151Z`} fill="url(#trend-shade)" />
        <AnimatedPath
          animatedProps={cmpProps}
          d={comparison}
          fill="none"
          stroke={ob.comparison}
          strokeWidth="2"
          strokeDasharray="1"
        />
        <AnimatedPath
          animatedProps={planProps}
          d={plan}
          fill="none"
          stroke={ob.ink}
          strokeWidth="2"
          strokeDasharray="1"
        />
        <SvgText x="206" y="65" fill="#9b7c86" fontSize="10">
          Without a plan
        </SvgText>
        <SvgText x="16" y="137" fill={ob.ink} fontSize="10" fontWeight="600">
          With ProteinQuest
        </SvgText>
        <Circle cx="12" cy="40" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Circle cx="296" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Line x1="7" x2="302" y1="151" y2="151" stroke="#aaa" />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>Month 1</Text>
        <Text style={styles.label}>Month 6</Text>
      </View>
    </View>
  );
}

export function PotentialChart({ animate = true }: { animate?: boolean }) {
  const progress = useDraw(animate);
  const d = 'M12 140 C90 145 126 100 171 75 S244 28 295 25';
  const props = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));
  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="pot-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor="#bd8a67" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#f7f6fa" stopOpacity="0.1" />
          </LinearGradient>
        </Defs>
        {[40, 85, 130].map((y) => (
          <Line key={y} x1="12" x2="298" y1={y} y2={y} stroke="#dfdde1" strokeDasharray="2 3" />
        ))}
        <Path d={`${d} L295 150 L12 150Z`} fill="url(#pot-shade)" />
        <AnimatedPath
          animatedProps={props}
          d={d}
          fill="none"
          stroke={ob.ink}
          strokeWidth="2"
          strokeDasharray="1"
        />
        <Circle cx="12" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Circle cx="295" cy="25" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Line x1="7" x2="302" y1="151" y2="151" stroke="#aaa" />
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
        {[40, 85, 130].map((y) => (
          <Line key={y} x1="12" x2="298" y1={y} y2={y} stroke="#dfdde1" strokeDasharray="2 3" />
        ))}
        <Path d="M12 85 L296 85 L296 150 L12 150Z" fill="#d3d1d933" />
        <Path d="M12 85 L296 85" fill="none" stroke={ob.ink} strokeWidth="2" />
        <Circle cx="12" cy="85" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Circle cx="296" cy="85" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Line x1="7" x2="302" y1="151" y2="151" stroke="#aaa" />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>Now</Text>
        <Text style={styles.label}>Your goal</Text>
      </View>
    </View>
  );
}

export function ProgressChart({ animate = true }: { animate?: boolean }) {
  const progress = useDraw(animate);
  const d = 'M12 140 C90 145 126 100 171 75 S244 28 295 25';
  const props = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));
  return (
    <View style={styles.chart}>
      <Svg viewBox="0 0 310 170" width="100%" height={170}>
        <Defs>
          <LinearGradient id="prog-shade" x1="0" y1="0" x2="0" y2="1">
            <Stop stopColor="#d3d1d9" stopOpacity="0.4" />
            <Stop offset="1" stopColor="#f7f6fa" stopOpacity="0.1" />
          </LinearGradient>
        </Defs>
        {[40, 85, 130].map((y) => (
          <Line key={y} x1="12" x2="298" y1={y} y2={y} stroke="#dfdde1" strokeDasharray="2 3" />
        ))}
        <Path d={`${d} L295 150 L12 150Z`} fill="url(#prog-shade)" />
        <AnimatedPath
          animatedProps={props}
          d={d}
          fill="none"
          stroke={ob.ink}
          strokeWidth="2"
          strokeDasharray="1"
        />
        <Circle cx="12" cy="140" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Circle cx="295" cy="25" r="5" stroke={ob.ink} strokeWidth="2" fill="white" />
        <Line x1="7" x2="302" y1="151" y2="151" stroke="#aaa" />
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>Now</Text>
        <Text style={styles.label}>Your goal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { width: '100%' },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  label: { fontSize: 11, color: '#302c33' },
});
