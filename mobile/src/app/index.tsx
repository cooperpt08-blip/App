import { Redirect, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { Body, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { takePendingJoin } from '@/lib/pendingJoin';
import { isSupabaseConfigured } from '@/lib/supabase';

// The front door: sends each person to the right place.
export default function Index() {
  const { loading, session, profile, membership } = useAccount();
  const [pending, setPending] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (profile?.kind === 'customer') takePendingJoin().then(setPending);
    else setPending(null);
  }, [profile]);

  if (!isSupabaseConfigured) {
    return (
      <Screen>
        <Title>Almost ready</Title>
        <Body>Shape Up isn&apos;t connected to its database yet.</Body>
        <Notice tone="note">
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the file mobile/.env.local, then restart
          the app. The README explains where to find them.
        </Notice>
      </Screen>
    );
  }

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile) return <Redirect href="/setup" />;
  if (membership) return <Redirect href={membership.role === 'owner' ? '/shop' : '/upcoming'} />;
  if (pending === undefined) return <Loading />;
  if (pending) return <Redirect href={`/join/${pending}` as Href} />;
  return <Redirect href="/home" />;
}
