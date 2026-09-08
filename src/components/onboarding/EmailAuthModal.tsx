import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { resetPasswordForEmail, signInWithEmail } from '@/lib/onboarding-auth';

import { PrimaryButton, TextButton } from './Controls';
import { ob } from './theme';

export function EmailAuthModal({
  visible,
  login,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  login: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(login ? 'login' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (visible) {
      setMode(login ? 'login' : 'signup');
      setError('');
      setMessage('');
      setPassword('');
    }
  }, [visible, login]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'reset') {
        await resetPasswordForEmail(email);
        setMessage('If an account exists for this address, a password reset link is on its way.');
      } else {
        const result = await signInWithEmail({
          email,
          password,
          mode: mode === 'login' ? 'login' : 'signup',
        });
        setPassword('');
        if (result.needsEmailConfirm) {
          setMessage('Check your email to confirm your account, then return here to sign in.');
        } else {
          onSuccess();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>
            {mode === 'reset'
              ? 'Reset password'
              : mode === 'login'
                ? 'Sign in with email'
                : 'Create your account'}
          </Text>
          <Text style={styles.sub}>Securely connect your ProteinQuest account.</Text>
          {mode !== 'reset' ? null : null}
          <Text style={styles.label}>Email address</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            placeholder="you@email.com"
            placeholderTextColor={ob.muted2}
          />
          {mode !== 'reset' ? (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                secureTextEntry
                autoComplete={mode === 'login' ? 'password' : 'new-password'}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={ob.muted2}
              />
            </>
          ) : null}
          <PrimaryButton
            label={busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'login' ? 'Sign in' : 'Create account'}
            onPress={submit}
            disabled={busy}
          />
          {mode === 'login' ? (
            <TextButton
              label="Forgot password?"
              onPress={() => {
                setMode('reset');
                setError('');
                setMessage('');
              }}
            />
          ) : null}
          {mode !== 'reset' ? (
            <TextButton
              label={mode === 'login' ? 'Create an account' : 'Back to sign in'}
              onPress={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setMessage('');
              }}
            />
          ) : (
            <TextButton
              label="Back to sign in"
              onPress={() => {
                setMode('login');
                setError('');
                setMessage('');
              }}
            />
          )}
          {busy ? <ActivityIndicator color={ob.accent} style={{ marginTop: 8 }} /> : null}
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextButton label="Close" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 365,
    backgroundColor: ob.surface,
    borderRadius: 23,
    padding: 25,
    gap: 8,
    borderWidth: 1,
    borderColor: ob.border,
  },
  title: { fontSize: 21, fontWeight: '600', letterSpacing: -0.5, color: ob.ink },
  sub: { fontSize: 13, color: ob.muted, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: 12, color: ob.ink, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: ob.border,
    borderRadius: 10,
    padding: 13,
    fontSize: 14,
    color: ob.ink,
    marginBottom: 4,
    backgroundColor: ob.raised,
  },
  message: { fontSize: 12, color: ob.muted, marginTop: 6 },
  error: { fontSize: 11, color: ob.danger, marginTop: 6, lineHeight: 16 },
});
