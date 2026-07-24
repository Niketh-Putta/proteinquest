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
 * Longest side after crop/resize.
 * 720 keeps portion detail sharp for the model without huge upload/TTFT cost.
 * (Previously 448 @ 0.48 JPEG, which looked soft in Logged Today + analysis.)
 */
export const EXPORT_MAX_SIDE = 720;

/**
 * Prepare a meal photo for analyze.
 * - Live camera: crop to the square viewfinder, then resize to EXPORT_MAX_SIDE.
 * - Library import: keep the full image aspect ratio (no square crop); only downscale.
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
    chain = chain.crop(crop).resize({ width: EXPORT_MAX_SIDE });
  } else {
    const resize = libraryExportResize(width, height, EXPORT_MAX_SIDE);
    if (resize) chain = chain.resize(resize);
  }

  const rendered = await chain.renderAsync();

  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    // ~0.8: crisp food detail without ballooning base64 / upload time.
    compress: 0.8,
    base64: true,
  });

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
