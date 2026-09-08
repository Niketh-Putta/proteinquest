'use client';
import { useEffect, useState } from 'react';
import { proteinQuestAuth } from '@/lib/proteinquest-auth';

export function AccountSession({ onSignedOut }: { onSignedOut: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const { data: { subscription } } = proteinQuestAuth.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.is_anonymous ? '' : session?.user.email || '');
    });
    return () => subscription.unsubscribe();
  }, []);
  if (!email) return null;
  return <div style={{fontSize:12,marginTop:20,overflowWrap:'anywhere'}}>
    <p>Signed in as {email}</p>
    <button className="text-button" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      const result = await proteinQuestAuth.auth.signOut({ scope: 'local' });
      setBusy(false);
      if (result.error) setError(result.error.message);
      else onSignedOut();
    }}>{busy ? 'Signing out…' : 'Sign out'}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
