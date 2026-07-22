import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { cameraViewfinderCrop, libraryExportResize, type CameraCrop } from './camera-geometry';

export type SquareMealPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

export type { CameraCrop } from './camera-geometry';

/** Enough detail for portions; smaller = faster upload + model TTFT. */
const EXPORT_MAX_SIDE = 512;

/**
 * Prepare a meal photo for analyze.
 * - Live camera: crop to the square viewfinder, then resize to EXPORT_MAX_SIDE.
 * - Library import: keep the full image aspect ratio (no square crop); only downscale.
 */
export async function prepareSquareMealPhoto(
  uri: string,
  cameraCrop?: CameraCrop,
): Promise<SquareMealPhoto> {
  // Image.getSize can return Fresco's downsampled dimensions on Android.
  // Decode through ImageManipulator so crop coordinates match its actual bitmap.
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = source;

  let chain = ImageManipulator.manipulate(uri);

  if (cameraCrop) {
    const crop = cameraViewfinderCrop(width, height, cameraCrop);
    chain = chain.crop(crop).resize({ width: EXPORT_MAX_SIDE });
  } else {
    const resize = libraryExportResize(width, height, EXPORT_MAX_SIDE);
    if (resize) chain = chain.resize(resize);
  }

  const rendered = await chain.renderAsync();

  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.55,
    base64: true,
  });

  if (!saved.base64) {
    throw new Error('Could not read that image. If it came from your library, try a JPEG or PNG.');
  }

  return {
    uri: saved.uri,
    base64: saved.base64,
    width: saved.width,
    height: saved.height,
  };
}
