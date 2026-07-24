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
export const EXPORT_MAX_SIDE = 1600;

/**
 * High JPEG quality for food detail. Below 1 to cut encode time / payload size
 * without the muddy look of aggressive compress; oversize still steps down once.
 */
export const EXPORT_JPEG_QUALITY = 0.92;

/** Soft cap matching api.ts MAX_IMAGE_BASE64 (~3.5M chars). */
const MAX_EXPORT_BASE64 = 3_500_000;

/**
 * Prepare a meal photo for analyze.
 * - Live camera: crop to the square viewfinder; downscale only if longer than EXPORT_MAX_SIDE.
 * - Library import: keep full aspect ratio (no square crop); downscale only if needed.
 * - Never horizontal-flips / mirrors the bitmap (analysis uses the sensor/file pixels as-is).
 *
 * `uri` is always a `data:image/jpeg;base64,...` URL so web previews work under CSP
 * (img-src allows data: but not blob:) and Safari never shows a broken "Load Error".
 */
export async function prepareSquareMealPhoto(
  uri: string,
  cameraCrop?: CameraCrop,
): Promise<SquareMealPhoto> {
  // Image.getSize can return Fresco's downsampled dimensions on Android.
  // Decode through ImageManipulator so crop coordinates match its actual bitmap.
  // Reuse the decoded ref for crop/resize so we do not reload the source URI
  // (web ImageManipulator sets crossOrigin=anonymous, which can fail on data:/blob:).
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = source;

  if (!width || !height) {
    throw new Error('Could not read that image. Try again or pick a different photo.');
  }

  let chain = ImageManipulator.manipulate(source);

  if (cameraCrop) {
    const crop = cameraViewfinderCrop(width, height, cameraCrop);
    chain = chain.crop(crop);
    // Only downscale oversized crops; do not force a tiny export or upscale.
    if (crop.width > EXPORT_MAX_SIDE) {
      chain = chain.resize({ width: EXPORT_MAX_SIDE });
    }
  } else {
    const resize = libraryExportResize(width, height, EXPORT_MAX_SIDE);
    if (resize) chain = chain.resize(resize);
  }

  const rendered = await chain.renderAsync();

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
