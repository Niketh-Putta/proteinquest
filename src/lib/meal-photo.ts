import { Image } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { cameraViewfinderCrop, libraryExportResize, type CameraCrop } from './camera-geometry';

export type SquareMealPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

export type { CameraCrop } from './camera-geometry';

/**
 * Longest-side cap before analyze/upload.
 * Needed so base64 stays under api.ts MAX_IMAGE_BASE64 (~3.5M chars / ~2.6MB binary).
 * Prefer keeping the original when already smaller; never upscale; never flip/mirror.
 */
export const EXPORT_MAX_SIDE = 1280;

/**
 * JPEG quality for food detail. Below 1 to cut encode time / payload size
 * without the muddy look of aggressive compress; oversize still steps down once.
 */
export const EXPORT_JPEG_QUALITY = 0.82;

/** Soft cap matching api.ts MAX_IMAGE_BASE64 (~3.5M chars). */
const MAX_EXPORT_BASE64 = 3_500_000;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err ?? new Error('Could not read that image.')),
    );
  });
}

/**
 * Prepare a meal photo for analyze.
 * - Live camera: crop to the square viewfinder; downscale only if longer than EXPORT_MAX_SIDE.
 * - Library import: keep full aspect ratio (no square crop); downscale only if needed.
 * - Never horizontal-flips / mirrors the bitmap (analysis uses the sensor/file pixels as-is).
 *
 * Important (iOS): never `renderAsync()` a full-res still first. That jetsams the
 * app (looks like a sudden close). Crop/resize in one manipulate chain, then render once.
 *
 * `uri` is always a `data:image/jpeg;base64,...` URL so web previews work under CSP
 * (img-src allows data: but not blob:) and Safari never shows a broken "Load Error".
 */
export async function prepareSquareMealPhoto(
  uri: string,
  cameraCrop?: CameraCrop,
): Promise<SquareMealPhoto> {
  let rendered;

  if (cameraCrop) {
    // Live camera: size via metadata, crop+resize on the URI, one render (no full-res ImageRef).
    let width = 0;
    let height = 0;
    try {
      const sized = await getImageSize(uri);
      width = sized.width;
      height = sized.height;
    } catch {
      // Fall through; manipulator may still succeed on some URIs.
    }
    if (!width || !height) {
      throw new Error('Could not read that image. Try again or pick a different photo.');
    }
    const crop = cameraViewfinderCrop(width, height, cameraCrop);
    let chain = ImageManipulator.manipulate(uri).crop(crop);
    if (crop.width > EXPORT_MAX_SIDE) {
      chain = chain.resize({ width: EXPORT_MAX_SIDE });
    }
    rendered = await chain.renderAsync();
  } else {
    // Library: size first, resize in-chain, then render once (avoids full-res decode crash).
    let width = 0;
    let height = 0;
    try {
      const sized = await getImageSize(uri);
      width = sized.width;
      height = sized.height;
    } catch {
      // Fall through; manipulator may still succeed on some URIs.
    }
    let chain = ImageManipulator.manipulate(uri);
    if (width > 0 && height > 0) {
      const resize = libraryExportResize(width, height, EXPORT_MAX_SIDE);
      if (resize) chain = chain.resize(resize);
    } else {
      // Unknown size: force a safe long-side cap so iOS never loads a 12MP+ bitmap raw.
      chain = chain.resize({ width: EXPORT_MAX_SIDE });
    }
    rendered = await chain.renderAsync();
  }

  if (!rendered.width || !rendered.height) {
    throw new Error('Could not read that image. Try again or pick a different photo.');
  }

  let saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: EXPORT_JPEG_QUALITY,
    base64: true,
  });

  // One optional re-encode if still over the analyze payload cap (rare after resize).
  if (saved.base64 && saved.base64.length > MAX_EXPORT_BASE64) {
    saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.82,
      base64: true,
    });
  }

  if (!saved.base64) {
    throw new Error('Could not read that image. If it came from your library, try a JPEG or PNG.');
  }

  return {
    uri: `data:image/jpeg;base64,${saved.base64}`,
    base64: saved.base64,
    width: saved.width,
    height: saved.height,
  };
}
