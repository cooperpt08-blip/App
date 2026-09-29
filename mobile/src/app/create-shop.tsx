import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { Body, Button, Field, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

export default function CreateShop() {
  const { profile, membership, refresh } = useAccount();
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  const [displayName, setDisplayName] = useState(profile?.first_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('create_shop', {
      p_name: shopName.trim(),
      p_address: address.trim(),
      p_display_name: displayName.trim(),
    });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refresh();
    router.replace('/shop');
  }

  // Already owns or works at a shop: show that shop instead.
  if (membership) return <Redirect href="/" />;

  return (
    <Screen>
      <Title>Set up your shop</Title>
      <Body muted>You can change these later.</Body>
      <Field label="Shop name" value={shopName} onChangeText={setShopName} maxLength={80} placeholder="Fade Factory" />
      <Field label="Address" value={address} onChangeText={setAddress} maxLength={200} placeholder="123 Main St, Springfield" />
      <Field
        label="Your name as clients see it"
        hint="Clients can pick you as their barber."
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={40}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        title="Create my shop"
        onPress={create}
        loading={busy}
        disabled={!shopName.trim() || !displayName.trim()}
      />
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
