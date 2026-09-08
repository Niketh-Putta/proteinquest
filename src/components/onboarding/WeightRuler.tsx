import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { KG_TO_LB, clampWeight } from '@/lib/onboarding-flow';

import { ob } from './theme';

const TICK_WIDTH = 8;

export function WeightRuler({
  value,
  unit,
  min,
  max,
  onChange,
}: {
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const viewport = useRef<ScrollView>(null);
  const [width, setWidth] = useState(320);
  const emitted = useRef<number | null>(null);
  const positioned = useRef<number | null>(null);
  const multiplier = unit === 'lbs' ? KG_TO_LB : 1;
  const first = Math.ceil(min * multiplier * 10);
  const last = Math.floor(max * multiplier * 10);
  const count = Math.max(0, last - first);

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i <= count; i++) out.push(first + i);
    return out;
  }, [first, count]);

  useEffect(() => {
    if (emitted.current !== null && Math.abs(emitted.current - value) < 0.000001) {
      emitted.current = null;
      return;
    }
    const offset = Math.max(
      0,
      Math.min(count * TICK_WIDTH, (value * multiplier * 10 - first) * TICK_WIDTH),
    );
    positioned.current = offset;
    viewport.current?.scrollTo({ x: offset, animated: false });
  }, [value, multiplier, first, count]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    if (positioned.current !== null && Math.abs(x - positioned.current) < 1) {
      positioned.current = null;
      return;
    }
    positioned.current = null;
    const tick = Math.max(0, Math.min(count, Math.round(x / TICK_WIDTH)));
    const next = (first + tick) / 10 / multiplier;
    if (Math.abs(next - value) > 0.000001) {
      emitted.current = next;
      onChange(next);
    }
  }

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  return (
    <View style={styles.ruler}>
      <View style={styles.marker} pointerEvents="none" />
      <ScrollView
        ref={viewport}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={onLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={TICK_WIDTH}
        contentContainerStyle={{
          paddingHorizontal: width / 2,
          width: count * TICK_WIDTH + width,
        }}>
        <View style={styles.track}>
          {ticks.map((t, i) => {
            const major = t % 10 === 0;
            return (
              <View
                key={t}
                style={[
                  styles.tick,
                  { height: major ? 36 : t % 5 === 0 ? 26 : 18 },
                  i === 0 && { marginLeft: 0 },
                ]}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

export function WeightInput({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const display = () => String(+(value * (unit === 'lbs' ? KG_TO_LB : 1)).toFixed(1));
  const [draft, setDraft] = useState(display);
  useEffect(() => setDraft(display()), [value, unit]);

  function commit() {
    const clamped = clampWeight(draft, unit, min, max, value);
    onChange(clamped);
    setDraft(String(+(clamped * (unit === 'lbs' ? KG_TO_LB : 1)).toFixed(1)));
  }

  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType="decimal-pad"
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      style={styles.input}
    />
  );
}

const styles = StyleSheet.create({
  ruler: {
    height: 70,
    marginTop: 28,
    marginBottom: 8,
    position: 'relative',
  },
  marker: {
    position: 'absolute',
    left: '50%',
    marginLeft: -1,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#27232c',
    zIndex: 2,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 50,
  },
  tick: {
    width: 1,
    marginLeft: TICK_WIDTH - 1,
    backgroundColor: '#8c8b91',
  },
  input: {
    width: 105,
    fontSize: 31,
    fontWeight: '600',
    textAlign: 'right',
    color: ob.ink,
    padding: 0,
  },
});
