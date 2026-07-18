import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type SquareMealPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

/** Enough detail for portions; smaller = faster upload + model TTFT. */
const SQUARE_EXPORT_WIDTH = 512;

/** Center-crop to square, then resize for analysis upload. */
export async function prepareSquareMealPhoto(uri: string): Promise<SquareMealPhoto> {
  // Image.getSize can return Fresco's downsampled dimensions on Android.
  // Decode through ImageManipulator so crop coordinates match its actual bitmap.
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = source;
  const side = Math.min(width, height);
  const originX = Math.floor((width - side) / 2);
  const originY = Math.floor((height - side) / 2);

  const rendered = await ImageManipulator.manipulate(uri)
    .crop({ originX, originY, width: side, height: side })
    .resize({ width: SQUARE_EXPORT_WIDTH })
    .renderAsync();

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
