import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { Body, Button, Card, Eyebrow, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Shop = { id: string; name: string; address: string };

// The customer's home screen.
export default function CustomerHome() {
  const { profile, signOut, refresh } = useAccount();
  const [shop, setShop] = useState<Shop | null>(null);
  const [invites, setInvites] = useState<{ invite_id: string; shop_name: string }[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (profile?.shop_id) {
      const { data } = await supabase.from('shops').select('id, name, address').eq('id', profile.shop_id).maybeSingle();
      setShop(data as Shop | null);
    } else {
      setShop(null);
    }
    const { data: inv } = await supabase.rpc('my_invites');
    setInvites((inv as { invite_id: string; shop_name: string }[] | null) ?? []);
  }, [profile?.shop_id]);

  useEffect(() => {
    load();
  }, [load]);

  async function joinWithCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('join_shop', { p_code: code });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setCode('');
    await refresh();
  }

  if (!profile) return null;

  return (
    <Screen>
      <Eyebrow>Shape Up</Eyebrow>
      <Title>Hi {profile.first_name}</Title>

      {invites.length > 0 && (
        <Notice tone="note">
          {invites[0].shop_name} invited you to join as a barber. Go to setup to accept.
        </Notice>
      )}
      {invites.length > 0 && <Button title="Accept barber invite" variant="secondary" onPress={() => router.push('/setup')} />}

      <Card>
        <Label>Your barbershop</Label>
        {shop ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>{shop.name}</Text>
            {shop.address ? <Body muted>{shop.address}</Body> : null}
            <Body muted>You get up to 5 haircut recommendations a month.</Body>
          </>
        ) : (
          <>
            <Body>Not linked to a shop yet. Scan the QR code at your barbershop, or type the code below.</Body>
            <Body muted>Without a shop you get 1 free recommendation.</Body>
            <Field
              label="Shop code"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              placeholder="ABC123"
            />
            {error && <Notice tone="error">{error}</Notice>}
            <Button title="Join shop" onPress={joinWithCode} loading={busy} disabled={code.trim().length !== 6} />
          </>
        )}
      </Card>

      <Button title="Get my haircut recommendations" onPress={() => router.push('/start' as Href)} disabled />
      <Body muted center>Recommendations arrive in the next build step.</Body>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
