export type AppVersionConfig = {
  latest_version: string;
  min_version: string;
  ios_store_url: string | null;
  android_store_url: string | null;
  message: string | null;
};

export type UpdatePromptKind = 'none' | 'soft' | 'force';

export type UpdatePromptDecision = {
  kind: UpdatePromptKind;
  currentVersion: string;
  latestVersion: string;
  minVersion: string;
  storeUrl: string;
  message: string;
};

export const DEFAULT_UPDATE_MESSAGE =
  'A newer version of ProteinQuest is available. Update to get the latest features and fixes.';

/** Compare semver-ish strings (1.0.8, 1.0.10). Non-numeric segments treated as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function decideUpdatePrompt(
  currentVersion: string,
  config: AppVersionConfig,
  storeUrl: string,
): UpdatePromptDecision {
  const latestVersion = config.latest_version.trim();
  const minVersion = config.min_version.trim();
  const message = config.message?.trim() || DEFAULT_UPDATE_MESSAGE;

  if (!latestVersion && !minVersion) {
    return {
      kind: 'none',
      currentVersion,
      latestVersion,
      minVersion,
      storeUrl,
      message,
    };
  }

  if (minVersion && compareVersions(currentVersion, minVersion) < 0) {
    return {
      kind: 'force',
      currentVersion,
      latestVersion: latestVersion || minVersion,
      minVersion,
      storeUrl,
      message,
    };
  }

  if (latestVersion && compareVersions(currentVersion, latestVersion) < 0) {
    return {
      kind: 'soft',
      currentVersion,
      latestVersion,
      minVersion,
      storeUrl,
      message,
    };
  }

  return {
    kind: 'none',
    currentVersion,
    latestVersion,
    minVersion,
    storeUrl,
    message,
  };
}
