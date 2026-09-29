import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Card, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

// Permanently deletes the account (required by Apple for any app with sign-up).
export default function DeleteAccount() {
  const { membership, signOut } = useAccount();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = membership?.role === 'owner';

  async function remove() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      setBusy(false);
      // Show the server's own explanation when there is one.
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        return setError(body?.error ?? friendlyError(error));
      }
      return setError('Couldn’t reach Shape Up to delete your account. Check your connection and try again.');
    }
    await signOut();
    router.replace('/');
  }

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => router.back()} />
      <Title>Delete my account</Title>
      <Body>This permanently deletes your Shape Up account. It can’t be undone.</Body>

      <Card>
        <Label>What gets deleted</Label>
        <Body>• Your account, name and email</Body>
        <Body>• Your photos, including your profile photo and any photos sent to barbershops</Body>
        <Body>• Your recommendations, cut cards and appointments</Body>
        {isOwner ? (
          <Notice tone="error">
            You own a shop. Deleting your account also deletes the shop, removes your barbers from it, and deletes
            its clients’ cut cards, bookings and notes.
          </Notice>
        ) : membership ? (
          <Body>• You’ll be removed from your barbershop’s team</Body>
        ) : null}
      </Card>

      <Field
        label="Type DELETE to confirm"
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        title="Permanently delete my account"
        variant="danger"
        onPress={remove}
        loading={busy}
        disabled={confirm.trim().toUpperCase() !== 'DELETE'}
      />
    </Screen>
  );
}
