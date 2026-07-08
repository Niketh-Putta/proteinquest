import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type SquareMealPhoto = {
  uri: string;
  base64: string;
  width: number;
  height: number;
};

const SQUARE_EXPORT_WIDTH = 768;

/** Center-crop to square, then resize for analysis upload. */
export async function prepareSquareMealPhoto(uri: string): Promise<SquareMealPhoto> {
  const source = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(source.width, source.height);
  const originX = Math.floor((source.width - side) / 2);
  const originY = Math.floor((source.height - side) / 2);

  const rendered = await ImageManipulator.manipulate(uri)
    .crop({ originX, originY, width: side, height: side })
    .resize({ width: SQUARE_EXPORT_WIDTH })
    .renderAsync();

  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.65,
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
