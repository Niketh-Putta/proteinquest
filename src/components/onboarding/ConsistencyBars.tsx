import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ob } from './theme';

const SHORT = 70;
const TALL = 140;

function GrowBar({
  height,
  delay,
  opacity = 1,
  children,
  reduced,
}: {
  height: number;
  delay: number;
  opacity?: number;
  children: React.ReactNode;
  reduced: boolean;
}) {
  const h = useSharedValue(reduced ? height : 0);
  const iconOp = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      h.value = height;
      iconOp.value = 1;
      return;
    }
    h.value = 0;
    iconOp.value = 0;
    h.value = withDelay(
      delay,
      withTiming(height, { duration: 1500, easing: Easing.bezier(0.22, 0.7, 0.2, 1) }),
    );
    iconOp.value = withDelay(delay + 1250, withTiming(1, { duration: 300 }));
  }, [delay, height, reduced, h, iconOp]);

  const barStyle = useAnimatedStyle(() => ({
    height: h.value,
    opacity,
    paddingBottom: h.value > 8 ? 15 : 0,
  }));
  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOp.value }));

  return (
    <Animated.View style={[styles.bar, barStyle]}>
      <Animated.View style={iconStyle}>{children}</Animated.View>
    </Animated.View>
  );
}

/** Matches web consistency-motion grow-comparison. */
export function ConsistencyBars() {
  const [reduced, setReduced] = useState(false);
  const checkOp = useSharedValue(0);

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

  useEffect(() => {
    checkOp.value = reduced
      ? 1
      : withDelay(1650, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) }));
  }, [reduced, checkOp]);

  const checkStyle = useAnimatedStyle(() => ({ opacity: checkOp.value }));

  return (
    <View style={styles.card}>
      <View style={styles.barPair}>
        <View style={styles.barCol}>
          <Text style={styles.barLabel}>Without{'\n'}ProteinQuest</Text>
          <GrowBar height={SHORT} delay={150} opacity={0.45} reduced={reduced}>
            <Ionicons name="people-outline" size={18} color={ob.primaryText} />
          </GrowBar>
        </View>
        <View style={styles.barCol}>
          <Text style={styles.barLabel}>With{'\n'}ProteinQuest</Text>
          <GrowBar height={TALL} delay={300} reduced={reduced}>
            <Ionicons name="heart" size={18} color={ob.primaryText} />
          </GrowBar>
        </View>
      </View>
      <Animated.Text style={[styles.checkLine, checkStyle]}>
        <Ionicons name="checkmark" size={14} color={ob.ink} /> Small daily actions lead to progress
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    backgroundColor: ob.card,
    borderRadius: 18,
    padding: 20,
  },
  barPair: { flexDirection: 'row', gap: 16, alignItems: 'flex-end', minHeight: 160 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barLabel: { fontSize: 12, textAlign: 'center', color: ob.muted, marginBottom: 8 },
  bar: {
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: ob.accent,
    overflow: 'hidden',
  },
  checkLine: { marginTop: 16, fontSize: 13, color: ob.ink },
});
