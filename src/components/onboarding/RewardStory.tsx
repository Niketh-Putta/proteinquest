import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { ob } from './theme';

export function RewardStory({ page }: { page: 1 | 2 }) {
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>
        {page === 1 ? 'BUILT FOR THE COMEBACK' : 'WHY PROTEINQUEST?'}
      </Text>
      <Text style={styles.title}>
        {page === 1 ? (
          <>
            Make progress.{'\n'}
            <Text style={styles.em}>Feel the win.</Text>
          </>
        ) : (
          <>
            Your food tracker.{'\n'}
            <Text style={styles.em}>With a reason to return.</Text>
          </>
        )}
      </Text>
      {page === 1 ? (
        <Text style={styles.lead}>You know your goal. Let’s make showing up for it feel good.</Text>
      ) : (
        <View style={styles.compCopy}>
          <Text style={styles.p}>
            <Text style={styles.b}>Cal AI</Text> might help you scan meals.
          </Text>
          <Text style={styles.p}>
            <Text style={styles.b}>MyFitnessPal</Text> might help you track nutrition.
          </Text>
          <Text style={[styles.p, styles.pq]}>
            <Text style={styles.b}>ProteinQuest</Text> will make you want to return by turning every
            meal into progress for your dragon.
          </Text>
        </View>
      )}

      {page === 1 ? (
        <View style={styles.scene}>
          <View style={styles.card}>
            <Ionicons name="camera-outline" size={22} color={ob.ink} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Meal logged</Text>
              <Text style={styles.cardSub}>One small action. Real momentum.</Text>
            </View>
            <Text style={styles.protein}>
              +32<Text style={styles.proteinUnit}>g protein</Text>
            </Text>
          </View>
          <View style={styles.connector} />
          <View style={styles.centre}>
            <View style={styles.complete}>
              <View style={styles.check}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
              <Text style={styles.cardTitle}>Goal hit.</Text>
              <Text style={styles.cardSub}>You showed up.</Text>
            </View>
            <Text style={styles.pop}>WIN UNLOCKED</Text>
          </View>
          <View style={styles.card}>
            <Ionicons name="flame" size={22} color={ob.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Your streak grows.</Text>
              <Text style={styles.cardSub}>So does your dragon.</Text>
            </View>
            <Ionicons name="arrow-up" size={22} color={ob.ink} />
          </View>
          <View style={styles.days}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <View key={`${d}-${i}`} style={styles.day}>
                <View style={styles.dayCheck}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
                <Text style={styles.dayLabel}>{d}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.comparison}>
            <View style={styles.chartHead}>
              <Text style={styles.chartHeadText}>THE ROUTINE WE’RE BUILDING</Text>
              <Ionicons name="flame" size={18} color={ob.accent} />
            </View>
            <Svg viewBox="0 0 320 240" width="100%" height={220}>
              <Defs>
                <LinearGradient id="reward-area" x1="0" y1="0" x2="0" y2="1">
                  <Stop stopColor="#db8753" stopOpacity="0.24" />
                  <Stop offset="1" stopColor="#db8753" stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path d="M18 62H302M18 126H302M18 190H302" stroke="#e6dfe5" strokeDasharray="3 5" />
              <Path
                d="M18 142 C80 145 102 115 150 89 S238 37 302 30 V209H18Z"
                fill="url(#reward-area)"
              />
              <Path
                d="M18 142 C75 136 100 153 146 173 S244 207 302 207"
                fill="none"
                stroke="#aaa0ac"
                strokeWidth="2"
              />
              <Path
                d="M18 142 C80 145 102 115 150 89 S238 37 302 30"
                fill="none"
                stroke="#bf7246"
                strokeWidth="2"
              />
              <Circle cx="18" cy="142" r="5" fill="white" stroke="#242026" strokeWidth="2" />
              <Circle cx="302" cy="30" r="5" fill="white" stroke="#bf7246" strokeWidth="2.5" />
              <Circle cx="302" cy="207" r="4" fill="white" stroke="#aaa0ac" strokeWidth="2" />
              <SvgText x="120" y="17" fill="#bf7246" fontSize="11" fontWeight="600">
                Rewarding tracking
              </SvgText>
              <SvgText x="100" y="227" fill="#9a929f" fontSize="11">
                When tracking feels empty
              </SvgText>
            </Svg>
            <View style={styles.axis}>
              <Text style={styles.axisText}>Getting started</Text>
              <Text style={styles.axisText}>Building a habit</Text>
            </View>
            <Text style={styles.caption}>
              Illustrative momentum, not measured outcomes or a comparison of app performance.
            </Text>
          </View>
          <View style={styles.payoff}>
            <Text style={styles.cardTitle}>Turn nutrition into a quest.</Text>
            <Text style={styles.cardSub}>Scan → hit your goal → build a streak → level your dragon.</Text>
          </View>
          <Text style={styles.fair}>
            The difference is the experience: your effort becomes visible progress for your dragon.
          </Text>
        </>
      )}

      <Text style={styles.bottom}>
        {page === 1
          ? 'A meal becomes a win. A win becomes a reason to come back.'
          : 'Choose the routine you’ll want to keep.'}
      </Text>
      <View style={styles.dots} accessibilityLabel={`Screen ${page} of 2`}>
        <View style={[styles.dot, page === 1 && styles.dotOn]} />
        <View style={[styles.dot, page === 2 && styles.dotOn]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: 12 },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#9b9083',
    fontWeight: '600',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.85,
    color: ob.inkSoft,
    lineHeight: 34,
  },
  em: { color: ob.accent, fontStyle: 'normal', fontWeight: '700' },
  lead: { marginTop: 12, fontSize: 14, color: ob.muted, lineHeight: 20 },
  compCopy: { marginTop: 12, gap: 8 },
  p: { fontSize: 14, color: ob.muted, lineHeight: 20 },
  pq: { color: ob.ink },
  b: { fontWeight: '700', color: ob.ink },
  scene: { marginTop: 22, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ob.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: ob.border,
  },
  cardTitle: { fontSize: 14, fontWeight: '600', color: ob.ink },
  cardSub: { fontSize: 12, color: ob.muted, marginTop: 2 },
  protein: { fontSize: 18, fontWeight: '700', color: ob.accent },
  proteinUnit: { fontSize: 10, fontWeight: '500', color: ob.muted },
  connector: { height: 16, width: 2, backgroundColor: '#e5e2e7', alignSelf: 'center' },
  centre: { alignItems: 'center', gap: 8 },
  complete: {
    alignItems: 'center',
    backgroundColor: '#f7f6fb',
    borderRadius: 18,
    padding: 18,
    width: '100%',
  },
  check: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: ob.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pop: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
    color: ob.accent,
  },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  day: { alignItems: 'center', gap: 4 },
  dayCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ob.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: { fontSize: 10, color: ob.muted },
  comparison: {
    marginTop: 16,
    backgroundColor: ob.card,
    borderRadius: 18,
    padding: 14,
  },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartHeadText: { fontSize: 10, letterSpacing: 1.2, color: '#9b9083', fontWeight: '600' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontSize: 11, color: '#302c33' },
  caption: { fontSize: 11, color: ob.muted2, marginTop: 8, lineHeight: 15 },
  payoff: {
    marginTop: 14,
    backgroundColor: ob.card,
    borderRadius: 16,
    padding: 16,
  },
  fair: { marginTop: 12, fontSize: 13, color: ob.muted, lineHeight: 18 },
  bottom: {
    marginTop: 18,
    fontSize: 13,
    color: ob.muted2,
    textAlign: 'center',
    lineHeight: 18,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#dddadf' },
  dotOn: { backgroundColor: ob.ink },
});
