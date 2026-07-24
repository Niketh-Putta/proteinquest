import * as ImagePicker from 'expo-image-picker';

export type PickedLibraryImage = {
  uri: string;
};

/**
 * Open the device photo library for a single meal image.
 * Returns null when the user cancels or permission is denied.
 */
export async function pickLibraryImage(): Promise<PickedLibraryImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Photo library access is needed to upload a meal photo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}
