import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';

import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';
import { Body, Button, Card, colors, Notice } from './ui';

type OwnerInvite = { shop_id: string; shop_name: string };

// Shown when a shop owner has handed their shop to this person's email.
export function OwnerInvites() {
  const { profile, refresh } = useAccount();
  const [invites, setInvites] = useState<OwnerInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_owner_invites');
    setInvites((data as OwnerInvite[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function accept(invite: OwnerInvite) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('accept_owner_invite', { p_shop: invite.shop_id });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refresh();
    router.replace('/');
  }

  if (invites.length === 0) return null;
  return (
    <>
      {invites.map((invite) => (
        <Card key={invite.shop_id}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text }}>
            You’ve been asked to take over {invite.shop_name}
          </Text>
          <Body muted>
            You’ll become the owner, with its team, clients, bookings and settings.
          </Body>
          {!profile && <Body muted>Enter your first name below first.</Body>}
          <Button title={`Take over ${invite.shop_name}`} onPress={() => accept(invite)} loading={busy} disabled={!profile} />
        </Card>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}
