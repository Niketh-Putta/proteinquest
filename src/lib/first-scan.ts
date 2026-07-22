import AsyncStorage from '@react-native-async-storage/async-storage';

const FORCE_FIRST_SCAN_KEY = 'pq:force-first-scan';

/** After onboarding, send the user into Scan until they log their first meal. */
export async function markNeedsFirstScan(): Promise<void> {
  await AsyncStorage.setItem(FORCE_FIRST_SCAN_KEY, '1');
}

export async function clearNeedsFirstScan(): Promise<void> {
  await AsyncStorage.removeItem(FORCE_FIRST_SCAN_KEY);
}

export async function needsFirstScan(): Promise<boolean> {
  return (await AsyncStorage.getItem(FORCE_FIRST_SCAN_KEY)) === '1';
}
