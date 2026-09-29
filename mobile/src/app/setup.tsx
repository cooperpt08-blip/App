import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Body, Button, Card, Eyebrow, Field, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Invite = { invite_id: string; shop_name: string };

// First-time setup: your first name, then whether you're a customer, a barber
// (if a shop invited your email), or a shop owner.
export default function Setup() {
  const { loading, session, profile, membership, refresh, signOut } = useAccount();
  const [name, setName] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('my_invites').then(({ data }) => setInvites((data as Invite[] | null) ?? []));
  }, []);

  async function saveName() {
    setBusy('name');
    setError(null);
    const { error } = await supabase.from('profiles').insert({ id: session!.user.id, first_name: name.trim() });
    setBusy(null);
    if (error) return setError(friendlyError(error));
    await refresh();
  }

  async function acceptInvite(invite: Invite) {
    setBusy(invite.invite_id);
    setError(null);
    const { error } = await supabase.rpc('accept_invite', { p_invite: invite.invite_id });
    setBusy(null);
    if (error) return setError(friendlyError(error));
    await refresh();
    router.replace('/');
  }

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  // Already part of a shop: go straight there instead of asking again.
  if (membership) return <Redirect href="/" />;

  if (!profile) {
    return (
      <Screen>
        <Eyebrow>Welcome to Shape Up</Eyebrow>
        <Title>What’s your first name?</Title>
        <Body muted>Your barber sees this on your cut card.</Body>
        <Field label="First name" value={name} onChangeText={setName} autoComplete="given-name" maxLength={40} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button title="Continue" onPress={saveName} loading={busy === 'name'} disabled={!name.trim()} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Eyebrow>Hi {profile.first_name}</Eyebrow>
      <Title>How will you use Shape Up?</Title>

      {invites.map((invite) => (
        <Card key={invite.invite_id}>
          <Text style={{ fontSize: 19, fontWeight: '700' }}>{invite.shop_name} invited you</Text>
          <Body muted>Join as a barber to see the cut cards clients send to the shop.</Body>
          <Button title="Join as a barber" onPress={() => acceptInvite(invite)} loading={busy === invite.invite_id} />
        </Card>
      ))}

      {error && <Notice tone="error">{error}</Notice>}

      <View style={{ gap: 12 }}>
        <Button title="I’m getting a haircut" onPress={() => router.replace('/home')} />
        <Button title="I own a barbershop" variant="secondary" onPress={() => router.push('/create-shop')} />
      </View>
      <Body muted>
        Barbers: ask your shop owner to invite your email address ({session?.user.email}), then come back here.
      </Body>
    </Screen>
  );
}
