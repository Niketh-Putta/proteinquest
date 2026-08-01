/**
 * Camera permission UI state for Scan.
 * Never treat "not asked yet" as denied — App Review Guideline 2.1(a).
 */

export type CameraPermissionSnapshot = {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
};

export type CameraPermissionUi =
  | 'loading'
  | 'requesting'
  | 'granted'
  | 'needs_prompt'
  | 'blocked';

export function resolveCameraPermissionUi(args: {
  permission: CameraPermissionSnapshot | null | undefined;
  requesting: boolean;
}): CameraPermissionUi {
  if (args.requesting) return 'requesting';
  if (!args.permission) return 'loading';
  if (args.permission.granted) return 'granted';

  const status = String(args.permission.status || '').toLowerCase();
  // System prompt not shown yet — keep a neutral state, never an error.
  if (status === 'undetermined' || status === '') return 'loading';

  if (args.permission.canAskAgain === false) return 'blocked';
  return 'needs_prompt';
}

/** True when the Continue button may call requestPermission(). */
export function shouldRequestCameraPermission(
  permission: CameraPermissionSnapshot | null | undefined,
): boolean {
  if (!permission) return false;
  if (permission.granted) return false;
  if (permission.canAskAgain === false) return false;
  return true;
}

/**
 * Auto-request only before the OS has answered.
 * After a denial with canAskAgain, wait for an explicit Continue tap.
 */
export function shouldAutoRequestCameraPermission(
  permission: CameraPermissionSnapshot | null | undefined,
): boolean {
  if (!permission) return false;
  if (permission.granted) return false;
  if (permission.canAskAgain === false) return false;
  const status = String(permission.status || '').toLowerCase();
  return status === 'undetermined' || status === '';
}
