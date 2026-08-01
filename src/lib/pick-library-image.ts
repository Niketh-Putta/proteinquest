import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** Broad image accept for non-iOS web (image/* covers jpeg, png, heic, webp, gif, etc.). */
const IMAGE_ACCEPT = 'image/*';

/**
 * Extensions only — iOS Safari treats image/* MIME as “also offer Take Photo”.
 * Keep gallery/files only; list common image extensions the platform can provide.
 */
const IMAGE_ACCEPT_IOS_NO_CAMERA =
  '.jpg,.jpeg,.jpe,.png,.webp,.gif,.bmp,.heic,.heif,.avif,.tif,.tiff,.svg,.ico,.jfif,.pjpeg,.pjp,application/octet-stream';

const IMAGE_EXT_RE =
  /\.(jpe?g|jfif|pjpeg|pjp|png|webp|gif|bmp|heic|heif|avif|tiff?|svg|ico)$/i;

type PickedImage = { uri: string };

function isIOSWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

function isAcceptableImageFile(file: File): boolean {
  // Photos from iOS "Choose File" sometimes omit MIME; allow by extension too
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXT_RE.test(file.name || '');
}

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>;
};

/**
 * Gallery-only image pick. Never opens the camera / "Take Photo" path.
 * On web, uses a file input with no `capture` attribute (and File System Access
 * API when available). Native uses the system photo library picker only.
 */
export async function pickLibraryImage(): Promise<PickedImage | null> {
  if (Platform.OS === 'web') {
    return pickLibraryImageWeb();
  }

  // Always request first — never surface a denial before the OS prompt.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    if (perm.canAskAgain === false) {
      throw new Error(
        'Photo library access is off. Enable Photos for ProteinQuest in Settings, or try again.',
      );
    }
    throw new Error('Photo library access is needed to upload a meal photo.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Full quality; prepareSquareMealPhoto may lightly downscale for API payload limits.
    quality: 1,
    // Android photo picker only (no legacy chooser that can list camera apps)
    legacy: false,
  });

  if (result.canceled || !result.assets[0]?.uri) return null;
  return { uri: result.assets[0].uri };
}

async function pickLibraryImageWeb(): Promise<PickedImage | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  // Chromium desktop: native file picker without camera / Take Photo
  const w = window as Window & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean;
      excludeAcceptAllOption?: boolean;
      types?: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<FileSystemFileHandleLike[]>;
  };

  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const handles = await w.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [
          {
            description: 'Images',
            accept: {
              'image/*': [
                '.jpg',
                '.jpeg',
                '.jpe',
                '.jfif',
                '.png',
                '.webp',
                '.gif',
                '.bmp',
                '.heic',
                '.heif',
                '.avif',
                '.tif',
                '.tiff',
                '.svg',
                '.ico',
              ],
            },
          },
        ],
      });
      const file = await handles[0]?.getFile();
      if (!file || !isAcceptableImageFile(file)) return null;
      return { uri: URL.createObjectURL(file) };
    } catch (e: unknown) {
      const name =
        e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'AbortError') return null;
      // Fall through to <input type="file"> for unsupported / insecure contexts
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // iOS: image/* MIME types make Safari offer "Take Photo". Use extensions
    // (+ octet-stream) so the sheet is library / files only. Never set `capture`.
    input.accept = isIOSWeb() ? IMAGE_ACCEPT_IOS_NO_CAMERA : IMAGE_ACCEPT;
    input.style.display = 'none';
    input.multiple = false;

    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onChange = () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      if (!isAcceptableImageFile(file)) {
        resolve(null);
        return;
      }
      resolve({ uri: URL.createObjectURL(file) });
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    document.body.appendChild(input);
    input.click();
  });
}
