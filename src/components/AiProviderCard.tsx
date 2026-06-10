import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  type AiProvider,
  clearGeminiApiKey,
  getAiProvider,
  getGeminiApiKey,
  setAiProvider,
  setGeminiApiKey,
} from '@/lib/ai-keys';
import { validateGeminiKey } from '@/lib/gemini';
import { colors, fonts, radius, spacing, type } from '@/theme';

export function AiProviderCard() {
  const [provider, setProvider] = useState<AiProvider>('server');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [savedKey, savedProvider] = await Promise.all([getGeminiApiKey(), getAiProvider()]);
    if (savedKey) {
      setKeyInput(savedKey);
      setConnected(true);
    }
    setProvider(savedProvider);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      await clearGeminiApiKey();
      await setAiProvider('server');
      setProvider('server');
      setConnected(false);
      setStatus('Key removed — using server AI');
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const check = await validateGeminiKey(trimmed);
      if (!check.ok) {
        setError(check.error ?? 'Invalid API key');
        setConnected(false);
        return;
      }
      await setGeminiApiKey(trimmed);
      const useGemini = provider !== 'server' ? provider : 'gemini';
      await setAiProvider(useGemini);
      setProvider(useGemini);
      setConnected(true);
      setStatus('Connected — Gemini ready');
    } catch (e: any) {
      setError(e.message ?? 'Could not save key');
      setConnected(false);
    } finally {
      setBusy(false);
    }
  }

  async function selectProvider(next: AiProvider) {
    setProvider(next);
    await setAiProvider(next);
    if (next === 'gemini' && !keyInput.trim()) {
      setError('Paste your Gemini API key first.');
    } else {
      setError(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>AI PROVIDER</Text>
      <Text style={styles.hint}>
        Paste your own Gemini key for free food analysis, or use the built-in server AI.
      </Text>

      <View style={styles.segment}>
        {(['gemini', 'server'] as const).map((opt) => {
          const active = provider === opt;
          const label = opt === 'gemini' ? 'My Gemini key' : 'Server (OpenAI)';
          return (
            <Pressable
              key={opt}
              onPress={() => selectProvider(opt)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {provider === 'gemini' ? (
        <View style={styles.keyBlock}>
          <Text style={styles.fieldLabel}>GEMINI API KEY</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={keyInput}
              onChangeText={(t) => {
                setKeyInput(t);
                setConnected(false);
                setStatus(null);
              }}
              onBlur={() => {
                if (keyInput.trim()) handleSave();
              }}
              placeholder="AIza..."
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
            />
            <Pressable onPress={() => setShowKey((s) => !s)} hitSlop={8} style={styles.eyeBtn}>
              <Ionicons
                name={showKey ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
          </View>
          <Text style={styles.helper}>
            Get your key at{' '}
            <Text style={{ color: colors.accent }}>aistudio.google.com/apikey</Text>
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={busy}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.saveText}>{connected ? 'Re-validate key' : 'Save key'}</Text>
            )}
          </Pressable>

          {connected ? (
            <View style={styles.connectedRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          ) : null}

          {keyInput.trim() ? (
            <Pressable onPress={() => { setKeyInput(''); clearGeminiApiKey().then(load); }} style={styles.clearBtn}>
              <Text style={styles.clearText}>Remove key</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.serverNote}>
          Uses the ProteinLens server (OpenAI). Requires active OpenAI billing on our account.
        </Text>
      )}

      {status ? <Text style={styles.status}>{status}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  label: { ...type.label },
  hint: { ...type.body, fontSize: 13 },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
    marginTop: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentBtnActive: { backgroundColor: colors.accent },
  segmentText: { fontFamily: fonts.displayMedium, fontSize: 12.5, color: colors.textSecondary },
  segmentTextActive: { color: colors.onAccent },
  keyBlock: { gap: spacing.sm, marginTop: 4 },
  fieldLabel: { ...type.label, fontSize: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.text,
    paddingVertical: 12,
  },
  eyeBtn: { padding: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  helper: { fontFamily: fonts.body, fontSize: 12, color: colors.textTertiary },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  saveText: { fontFamily: fonts.display, fontSize: 15, color: colors.onAccent },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connectedText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.accent, letterSpacing: 0.5 },
  clearBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  clearText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textTertiary },
  serverNote: { ...type.body, fontSize: 12.5, marginTop: 4 },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.accent },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger },
});
