export type ImageRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export type CameraCrop = {
  viewportWidth: number;
  viewportHeight: number;
  viewfinder: ImageRect;
};

/**
 * Maps a square overlay through an aspect-fill preview into source-image pixels.
 * CameraView's default preview is FILL/cover, so some source pixels lie outside
 * the viewport whenever the sensor and screen aspect ratios differ.
 */
export function cameraViewfinderCrop(
  sourceWidth: number,
  sourceHeight: number,
  cameraCrop: CameraCrop,
): ImageRect {
  const { viewportWidth, viewportHeight, viewfinder } = cameraCrop;
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    viewfinder.width <= 0 ||
    viewfinder.height <= 0
  ) {
    throw new Error('Invalid camera crop geometry');
  }

  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const hiddenX = (sourceWidth * scale - viewportWidth) / 2;
  const hiddenY = (sourceHeight * scale - viewportHeight) / 2;
  const requestedSide = Math.min(viewfinder.width, viewfinder.height) / scale;
  const side = Math.min(requestedSide, sourceWidth, sourceHeight);
  const maxX = sourceWidth - side;
  const maxY = sourceHeight - side;

  return {
    originX: Math.round(Math.max(0, Math.min((viewfinder.originX + hiddenX) / scale, maxX))),
    originY: Math.round(Math.max(0, Math.min((viewfinder.originY + hiddenY) / scale, maxY))),
    width: Math.max(1, Math.floor(side)),
    height: Math.max(1, Math.floor(side)),
  };
}
