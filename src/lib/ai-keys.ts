import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const GEMINI_KEY_ID = 'proteinlens_gemini_api_key';
const PROVIDER_KEY = 'proteinlens_ai_provider';

export type AiProvider = 'gemini' | 'server';

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(GEMINI_KEY_ID);
    }
    return await SecureStore.getItemAsync(GEMINI_KEY_ID);
  } catch {
    return null;
  }
}

export async function setGeminiApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (Platform.OS === 'web') {
    if (trimmed) localStorage.setItem(GEMINI_KEY_ID, trimmed);
    else localStorage.removeItem(GEMINI_KEY_ID);
    return;
  }
  if (trimmed) await SecureStore.setItemAsync(GEMINI_KEY_ID, trimmed);
  else await SecureStore.deleteItemAsync(GEMINI_KEY_ID);
}

export async function clearGeminiApiKey(): Promise<void> {
  await setGeminiApiKey('');
}

export async function getAiProvider(): Promise<AiProvider> {
  const stored = await AsyncStorage.getItem(PROVIDER_KEY);
  if (stored === 'server') return 'server';
  const key = await getGeminiApiKey();
  if (key) return 'gemini';
  return 'server';
}

export async function setAiProvider(provider: AiProvider): Promise<void> {
  await AsyncStorage.setItem(PROVIDER_KEY, provider);
}

/** Resolves which provider to use for the next analysis call. */
export async function resolveAnalysisProvider(): Promise<{
  provider: AiProvider;
  geminiKey: string | null;
}> {
  const [pref, key] = await Promise.all([AsyncStorage.getItem(PROVIDER_KEY), getGeminiApiKey()]);
  if (pref === 'server') return { provider: 'server', geminiKey: key };
  if (key) return { provider: 'gemini', geminiKey: key };
  return { provider: 'server', geminiKey: null };
}
