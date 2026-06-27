import { useSession } from './session';
import type { Profile } from './types';

/** Profile + auth signup time for grace-period checks (created_at backfill). */
export function usePaywallProfile(): {
  profile: Profile | null;
  authUserCreatedAt: string | undefined;
} {
  const { profile, session } = useSession();
  return {
    profile,
    authUserCreatedAt: session?.user?.created_at,
  };
}
