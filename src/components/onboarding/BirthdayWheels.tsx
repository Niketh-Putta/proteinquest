import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { WheelPicker } from './WheelPicker';
import { ob } from './theme';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: new Date(2000, i).toLocaleString('en', { month: 'long' }),
}));

export function BirthdayWheels({
  birthday,
  onChange,
}: {
  birthday: string;
  onChange: (iso: string) => void;
}) {
  const [year, month, day] = useMemo(() => birthday.split('-').map(Number), [birthday]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
    [daysInMonth],
  );
  const years = useMemo(
    () =>
      Array.from({ length: new Date().getFullYear() - 1919 }, (_, i) => ({
        value: 1920 + i,
        label: String(1920 + i),
      })),
    [],
  );

  function change(y: number, m: number, d: number) {
    const max = new Date(y, m, 0).getDate();
    const safeDay = Math.min(d, max);
    onChange(
      `${y}-${String(m).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`,
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.highlight} pointerEvents="none" />
      <WheelPicker
        label="Birth month"
        value={month}
        items={MONTHS}
        flex={1.8}
        onChange={(m) => change(year, m, day)}
      />
      <WheelPicker
        label="Birth day"
        value={Math.min(day, daysInMonth)}
        items={days}
        onChange={(d) => change(year, month, d)}
      />
      <WheelPicker
        label="Birth year"
        value={year}
        items={years}
        onChange={(y) => change(y, month, day)}
      />
    </View>
  );
}

export function HeightWheels({
  heightCm,
  unit,
  onChange,
}: {
  heightCm: number;
  unit: string;
  onChange: (cm: number) => void;
}) {
  const inch = Math.round(heightCm / 2.54);
  const cmItems = useMemo(
    () => Array.from({ length: 141 }, (_, i) => ({ value: 100 + i, label: `${100 + i} cm` })),
    [],
  );
  const ftItems = [3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} ft` }));
  const inItems = Array.from({ length: 12 }, (_, v) => ({ value: v, label: `${v} in` }));

  return (
    <View style={[styles.wrap, styles.height]}>
      <View style={styles.highlight} pointerEvents="none" />
      {unit === 'cm' ? (
        <WheelPicker
          label="Height in centimeters"
          value={Math.round(heightCm)}
          items={cmItems}
          onChange={onChange}
        />
      ) : (
        <>
          <WheelPicker
            label="Height in feet"
            value={Math.floor(inch / 12)}
            items={ftItems}
            onChange={(v) => onChange((v * 12 + (inch % 12)) * 2.54)}
          />
          <WheelPicker
            label="Height in inches"
            value={inch % 12}
            items={inItems}
            onChange={(v) => onChange((Math.floor(inch / 12) * 12 + v) * 2.54)}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    minHeight: 220,
    position: 'relative',
  },
  height: { width: '90%' },
  highlight: {
    position: 'absolute',
    top: 88,
    height: 44,
    left: 0,
    right: 0,
    backgroundColor: ob.wheelHighlight,
    borderRadius: 15,
    zIndex: 0,
  },
});
