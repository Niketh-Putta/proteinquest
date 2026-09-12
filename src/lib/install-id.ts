import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const KEY = 'pq_install_id';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getInstallId(): Promise<string> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const existing = window.localStorage.getItem(KEY);
      if (existing) return existing;
      const created = randomId();
      window.localStorage.setItem(KEY, created);
      return created;
    }
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const created = randomId();
    await AsyncStorage.setItem(KEY, created);
    return created;
  } catch {
    return randomId();
  }
}
