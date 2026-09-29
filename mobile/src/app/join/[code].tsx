import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Body, Button, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { savePendingJoin } from '@/lib/pendingJoin';
import { friendlyError, supabase } from '@/lib/supabase';

// Opened when a customer scans a shop's QR code (shapeup://join/ABC123).
export default function JoinShop() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { loading, session, profile, membership, refresh } = useAccount();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (loading || !code) return;
    if (!session || !profile) {
      // Remember the code, sign them in first, then come back here.
      savePendingJoin(code).then(() => router.replace('/'));
      return;
    }
    if (membership) {
      setResult({ ok: false, message: 'This is a barber account, so it can’t join a shop as a customer.' });
      return;
    }
    supabase.rpc('join_shop', { p_code: code }).then(async ({ data, error }) => {
      if (error) return setResult({ ok: false, message: friendlyError(error) });
      await refresh();
      const shop = (data as { joined_shop_name: string }[])[0];
      setResult({ ok: true, message: `You’re now linked to ${shop.joined_shop_name}.` });
    });
  }, [loading, session, profile, membership, code, refresh]);

  if (!result) return <Loading />;

  return (
    <Screen>
      <Title>{result.ok ? 'You’re in!' : 'Couldn’t join'}</Title>
      <Notice tone={result.ok ? 'success' : 'error'}>{result.message}</Notice>
      {result.ok && <Body muted>You now get up to 5 haircut recommendations a month, free.</Body>}
      <Button title="Continue" onPress={() => router.replace('/')} />
    </Screen>
  );
}
