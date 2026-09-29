import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Eyebrow, Field, Notice, Screen, Title } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

// Sign in or sign up with just an email: we email a 6-digit code, no password.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: cleanEmail, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: cleanEmail, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('That code didn’t work. Check it, or send a new one.');
    else router.replace('/');
  }

  return (
    <Screen>
      <Eyebrow>Shape Up</Eyebrow>
      <Title>{sent ? 'Check your email' : 'Sign in or create an account'}</Title>

      {!sent ? (
        <>
          <Body muted>Enter your email and we’ll send you a 6-digit code. No password needed.</Body>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button title="Send my code" onPress={sendCode} loading={busy} disabled={!cleanEmail.includes('@')} />
        </>
      ) : (
        <>
          <Body muted>We sent a code to {cleanEmail}. It can take a minute to arrive.</Body>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="123456"
          />
          {error && <Notice tone="error">{error}</Notice>}
          <Button title="Sign in" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
          <Button title="Use a different email" variant="secondary" onPress={() => setSent(false)} />
        </>
      )}
    </Screen>
  );
}
