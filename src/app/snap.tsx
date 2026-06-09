import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { analyzeFoodPhoto, countTodayScans, insertLog, uploadFoodPhoto } from '@/lib/api';
import { FREE_DAILY_SCANS } from '@/lib/payments';
import { useSession } from '@/lib/session';
import type { Analysis } from '@/lib/types';
import { colors, fonts, radius, spacing } from '@/theme';

type Phase = 'pick' | 'analyzing' | 'result';

export default function SnapScreen() {
  const { session, profile } = useSession();
  const [phase, setPhase] = useState<Phase>('pick');
  const [scansLeft, setScansLeft] = useState<number | null>(null);

  React.useEffect(() => {
    if (profile?.is_premium) return;
    countTodayScans()
      .then((used) => setScansLeft(Math.max(FREE_DAILY_SCANS - used, 0)))
      .catch(() => setScansLeft(null));
  }, [profile?.is_premium]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [proteinOverride, setProteinOverride] = useState('');
  const [saving, setSaving] = useState(false);

  async function pickImage(fromCamera: boolean) {
    if (!profile?.is_premium) {
      const used = await countTodayScans().catch(() => 0);
      if (used >= FREE_DAILY_SCANS) {
        router.push('/paywall');
        return;
      }
    }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        fromCamera
          ? 'ProteinLens needs camera access to analyze your food.'
          : 'ProteinLens needs photo access to analyze your food.',
      );
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
    if (result.canceled || !result.assets[0]) return;

    await analyze(result.assets[0].uri);
  }

  async function analyze(uri: string) {
    setPhase('analyzing');
    try {
      // Downscale so the upload is fast and AI cost stays tiny.
      const ctx = ImageManipulator.manipulate(uri).resize({ width: 1024 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.7,
        base64: true,
      });
      if (!saved.base64) throw new Error('Could not read the photo');

      setImageUri(saved.uri);
      setImageBase64(saved.base64);

      const res = await analyzeFoodPhoto(saved.base64);
      if (!res.is_food) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          'No food detected',
          "We couldn't spot any food in that photo. Try a clearer shot of your meal.",
        );
        setPhase('pick');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAnalysis(res);
      setProteinOverride(String(Math.round(res.total_protein_g)));
      setPhase('result');
    } catch (e: any) {
      Alert.alert('Analysis failed', e.message ?? 'Please try again.');
      setPhase('pick');
    }
  }

  async function handleSave() {
    if (!analysis || !session) return;
    const proteinG = parseFloat(proteinOverride);
    if (!proteinG && proteinG !== 0) {
      Alert.alert('Invalid amount', 'Enter the protein in grams.');
      return;
    }
    setSaving(true);
    try {
      const imagePath = imageBase64
        ? await uploadFoodPhoto(session.user.id, imageBase64)
        : null;
      await insertLog({
        userId: session.user.id,
        foodName: analysis.food_name,
        items: analysis.items,
        proteinG,
        calories: analysis.calories ? Math.round(analysis.calories) : null,
        confidence: analysis.confidence,
        imagePath,
        source: 'photo',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>
          {phase === 'result' ? 'Confirm & log' : 'Snap your meal'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {phase === 'pick' && (
        <View style={styles.pickWrap}>
          <View style={styles.pickHero}>
            <Ionicons name="restaurant" size={56} color={colors.accent} />
            <Text style={styles.pickTitle}>What are you eating?</Text>
            <Text style={styles.pickText}>
              Take a photo and the AI will identify the food and count the protein.
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            {!profile?.is_premium && scansLeft !== null ? (
              <Pressable onPress={() => router.push('/paywall')} style={styles.scansPill}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.scansPillText}>
                  {scansLeft > 0
                    ? `${scansLeft} free scan${scansLeft === 1 ? '' : 's'} left today`
                    : 'Out of free scans \u2014 go Pro'}
                </Text>
              </Pressable>
            ) : null}
            <Button title="Take a photo" onPress={() => pickImage(true)} />
            <Button
              title="Choose from library"
              variant="secondary"
              onPress={() => pickImage(false)}
            />
          </View>
        </View>
      )}

      {phase === 'analyzing' && (
        <View style={styles.analyzingWrap}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.analyzingImage} />
          ) : null}
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.analyzingTitle}>Counting protein{'\u2026'}</Text>
          <Text style={styles.analyzingText}>
            Identifying ingredients and portions
          </Text>
        </View>
      )}

      {phase === 'result' && analysis && (
        <ScrollView contentContainerStyle={styles.resultScroll}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.resultImage} /> : null}

          <Text style={styles.foodName}>{analysis.food_name}</Text>
          <View style={styles.confidenceRow}>
            <View
              style={[
                styles.confidenceDot,
                {
                  backgroundColor:
                    analysis.confidence === 'high'
                      ? colors.accent
                      : analysis.confidence === 'medium'
                        ? colors.warning
                        : colors.danger,
                },
              ]}
            />
            <Text style={styles.confidenceText}>
              {analysis.confidence} confidence
              {analysis.calories ? `  \u00B7  ~${Math.round(analysis.calories)} kcal` : ''}
            </Text>
          </View>

          <View style={styles.itemsCard}>
            {analysis.items.map((item, i) => (
              <View
                key={`${item.name}-${i}`}
                style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPortion}>{item.portion}</Text>
                </View>
                <Text style={styles.itemProtein}>{Math.round(item.protein_g)}g</Text>
              </View>
            ))}
          </View>

          {analysis.notes ? <Text style={styles.notes}>{analysis.notes}</Text> : null}

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total protein</Text>
            <View style={styles.totalInputRow}>
              <TextInput
                style={styles.totalInput}
                value={proteinOverride}
                onChangeText={(t) => setProteinOverride(t.replace(/[^0-9.]/g, ''))}
                keyboardType="numeric"
                maxLength={5}
              />
              <Text style={styles.totalUnit}>g</Text>
            </View>
            <Text style={styles.totalHint}>Tap the number to adjust it</Text>
          </View>

          <Button title="Log it" onPress={handleSave} loading={saving} />
          <Button
            title="Retake photo"
            variant="ghost"
            onPress={() => {
              setAnalysis(null);
              setPhase('pick');
            }}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  pickWrap: { flex: 1, padding: spacing.lg, justifyContent: 'space-between' },
  scansPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  scansPillText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  pickHero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  pickTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fonts?.rounded,
  },
  pickText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  analyzingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  analyzingImage: {
    width: 180,
    height: 180,
    borderRadius: radius.lg,
    marginBottom: spacing.md,
  },
  analyzingTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  analyzingText: { fontSize: 14, color: colors.textSecondary },
  resultScroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  resultImage: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  foodName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    fontFamily: fonts?.rounded,
  },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confidenceDot: { width: 8, height: 8, borderRadius: 4 },
  confidenceText: {
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  itemsCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.text },
  itemPortion: { fontSize: 13, color: colors.textTertiary, marginTop: 1 },
  itemProtein: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  notes: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' },
  totalCard: {
    backgroundColor: '#15180F',
    borderWidth: 1,
    borderColor: colors.accentDark,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  totalLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  totalInputRow: { flexDirection: 'row', alignItems: 'baseline' },
  totalInput: {
    fontSize: 52,
    fontWeight: '800',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 60,
    textAlign: 'center',
  },
  totalUnit: { fontSize: 26, color: colors.accentDark, fontWeight: '700' },
  totalHint: { fontSize: 12, color: colors.textTertiary },
});
