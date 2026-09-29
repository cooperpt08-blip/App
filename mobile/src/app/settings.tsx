import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text } from 'react-native';

import { Body, Button, Card, colors, Label, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { pushStatus, registerForPush, type PushStatus } from '@/lib/notifications';

const PUSH_TEXT: Record<PushStatus, string> = {
  on: 'On',
  off: 'Off. Turn them on in your phone’s Settings app, under Shape Up.',
  'not-asked': 'Not turned on yet.',
  unavailable: 'Not available in this version of the app.',
};

// Account, notifications, legal, and account deletion. Reachable from every home screen.
export default function Settings() {
  const { session, profile, membership, isAdmin, signOut } = useAccount();
  const [push, setPush] = useState<PushStatus | null>(null);

  useEffect(() => {
    pushStatus().then(setPush);
  }, []);

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Title>Settings</Title>

      <Card>
        <Label>Account</Label>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{profile?.first_name}</Text>
        <Body muted>{session?.user.email}</Body>
        {membership && <Body muted>{membership.role === 'owner' ? 'Shop owner' : 'Barber'}</Body>}
      </Card>

      <Card>
        <Label>Notifications</Label>
        <Body>
          {membership
            ? 'Get a notification when a client books, cancels, or sends a cut card.'
            : 'Get a reminder the day before your haircut.'}
        </Body>
        {push && <Body muted>{PUSH_TEXT[push]}</Body>}
        {push === 'not-asked' && (
          <Button title="Turn on notifications" onPress={async () => setPush(await registerForPush(true))} />
        )}
        {push === 'off' && <Button title="Open phone settings" variant="secondary" onPress={() => Linking.openSettings()} />}
      </Card>

      {isAdmin && (
        <Card>
          <Label>Shape Up admin</Label>
          <Button title="Open admin view" onPress={() => router.push('/admin')} />
        </Card>
      )}

      <Card>
        <Label>Legal</Label>
        <Button title="Privacy Policy" variant="secondary" onPress={() => router.push('/legal/privacy')} />
        <Button title="Terms of Service" variant="secondary" onPress={() => router.push('/legal/terms')} />
      </Card>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete my account" variant="danger" onPress={() => router.push('/delete-account')} />
    </Screen>
  );
}
