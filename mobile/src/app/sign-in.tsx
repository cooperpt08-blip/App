import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Body, Button, colors, Eyebrow, Field, Notice, Screen, Title } from '@/components/ui';
import { friendlyError, supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up' | 'check-email';

// Sign in or create an account with an email and password. New accounts get a
// confirmation email from Supabase; they tap the link, then sign in here.
export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const cleanEmail = email.trim().toLowerCase();
  const ready = cleanEmail.includes('@') && password.length >= 8;

  async function signIn() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    setBusy(false);
    if (!error) return router.replace('/');
    if (error.code === 'email_not_confirmed') {
      setMode('check-email');
    } else if (error.code === 'invalid_credentials') {
      setError('That email and password don’t match. Check them, or create an account.');
    } else {
      setError(friendlyError(error));
    }
  }

  async function signUp() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    // If email confirmation is turned off in Supabase, they're signed in right away.
    if (data.session) return router.replace('/');
    setMode('check-email');
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setInfo('Sent. It can take a few minutes, and check your spam folder.');
  }

  if (mode === 'check-email') {
    return (
      <Screen>
        <Eyebrow>Shape Up</Eyebrow>
        <Title>Confirm your email</Title>
        <Body>
          We sent a link to {cleanEmail}. Tap it to confirm your account, then come back here and sign in.
        </Body>
        <Notice tone="note">
          After you tap the link, your browser may show a page that doesn’t load. That’s expected for now. Your
          email is still confirmed.
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}
        <Button title="I’ve confirmed, sign me in" onPress={signIn} loading={busy} />
        <Button title="Send the email again" variant="secondary" onPress={resend} disabled={busy} />
        <Button title="Back" variant="secondary" onPress={() => setMode('sign-in')} />
      </Screen>
    );
  }

  const isSignUp = mode === 'sign-up';

  return (
    <Screen>
      <Eyebrow>Shape Up</Eyebrow>
      <Title>{isSignUp ? 'Create your account' : 'Sign in'}</Title>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <Field
        label="Password"
        hint={isSignUp ? 'At least 8 characters.' : undefined}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button title={isSignUp ? 'Create account' : 'Sign in'} onPress={isSignUp ? signUp : signIn} loading={busy} disabled={!ready} />
      {isSignUp && (
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
          By creating an account, you agree to the{' '}
          <Text style={{ textDecorationLine: 'underline', color: colors.text }} onPress={() => router.push('/legal/terms')}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text style={{ textDecorationLine: 'underline', color: colors.text }} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>
          .
        </Text>
      )}
      <Button
        title={isSignUp ? 'I already have an account' : 'Create a new account'}
        variant="secondary"
        onPress={() => {
          setError(null);
          setMode(isSignUp ? 'sign-in' : 'sign-up');
        }}
      />
    </Screen>
  );
}
