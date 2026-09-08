'use client';
import { useState } from 'react';
import { proteinQuestAuth } from '@/lib/proteinquest-auth';

export function EmailAuth({ login, recovery = false, onSuccess }: { login: boolean; recovery?: boolean; onSuccess: () => void }) {
  const [mode, setMode] = useState(recovery ? 'update' : login ? 'login' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const callback = window.location.origin + '/?auth=callback';
      if (mode === 'reset') {
        const result = await proteinQuestAuth.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/?auth=recovery' });
        if (result.error) throw result.error;
        setMessage('If an account exists for this address, a password reset link is on its way.');
      } else if (mode === 'update') {
        const result = await proteinQuestAuth.auth.updateUser({ password });
        if (result.error) throw result.error;
        setPassword(''); onSuccess();
      } else if (mode === 'login') {
        const result = await proteinQuestAuth.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        setPassword(''); onSuccess();
      } else {
        localStorage.setItem('proteinquest-auth-mode', 'onboarding');
        const result = await proteinQuestAuth.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callback } });
        if (result.error) throw result.error;
        setPassword('');
        if (result.data.session) onSuccess();
        else setMessage('Check your email to confirm your account, then return here to sign in.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    {mode !== 'update' && <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>}
    {mode !== 'reset' && <label>{mode === 'update' ? 'New password' : 'Password'}<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 8} value={password} onChange={e => setPassword(e.target.value)} /></label>}
    <button className="primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'update' ? 'Save new password' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    {mode === 'login' && <button type="button" className="text-button" disabled={busy} onClick={() => {setMode('reset');setError('');setMessage('');}}>Forgot password?</button>}
    {mode !== 'update' && <button type="button" className="text-button" disabled={busy} onClick={() => {setMode(mode === 'login' ? 'signup' : 'login');setError('');setMessage('');}}>{mode === 'login' ? 'Create an account' : 'Back to sign in'}</button>}
    {message && <p role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </form>;
}
