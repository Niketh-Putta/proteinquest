import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import {
  decideUpdatePrompt,
  type AppVersionConfig,
  type UpdatePromptDecision,
} from './app-update-logic';
import { supabase } from './supabase';

export {
  compareVersions,
  decideUpdatePrompt,
  DEFAULT_UPDATE_MESSAGE,
  type AppVersionConfig,
  type UpdatePromptDecision,
  type UpdatePromptKind,
} from './app-update-logic';

export const APP_STORE_URL = 'https://apps.apple.com/app/id6781790996';
export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.proteinquest.app';

export function getInstalledAppVersion(): string {
  if (Platform.OS === 'web') {
    return (
      Constants.expoConfig?.version ??
      (Constants.nativeAppVersion as string | null | undefined) ??
      '0.0.0'
    );
  }
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '0.0.0'
  );
}

export function getStoreUrl(
  config?: Pick<AppVersionConfig, 'ios_store_url' | 'android_store_url'> | null,
): string {
  if (Platform.OS === 'ios') return config?.ios_store_url?.trim() || APP_STORE_URL;
  if (Platform.OS === 'android') return config?.android_store_url?.trim() || PLAY_STORE_URL;
  return APP_STORE_URL;
}

export async function fetchAppVersionConfig(): Promise<AppVersionConfig | null> {
  const { data, error } = await supabase
    .from('app_version_config')
    .select('latest_version, min_version, ios_store_url, android_store_url, message')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return null;
  return data as AppVersionConfig;
}

export async function checkForAppUpdate(): Promise<UpdatePromptDecision | null> {
  if (Platform.OS === 'web') return null;

  try {
    const config = await fetchAppVersionConfig();
    if (!config) return null;
    return decideUpdatePrompt(getInstalledAppVersion(), config, getStoreUrl(config));
  } catch {
    return null;
  }
}

export async function openAppStoreListing(url: string): Promise<void> {
  await Linking.openURL(url);
}
