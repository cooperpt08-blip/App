import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';

import { Body, Button, Card, colors, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { friendlyError, supabase } from '@/lib/supabase';

type Member = { user_id: string; display_name: string; role: 'owner' | 'barber' };

// Permanently deletes the account (required by Apple for any app with sign-up).
// Shop owners first choose who takes over the shop, so it isn't lost.
export default function DeleteAccount() {
  const { session, membership, refresh, signOut } = useAccount();
  const isOwner = membership?.role === 'owner';
  const [shopName, setShopName] = useState('');
  const [barbers, setBarbers] = useState<Member[]>([]);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [closeShop, setCloseShop] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadShop = useCallback(async () => {
    if (!membership || membership.role !== 'owner') return;
    const [{ data: shop }, { data: team }, { data: invite }] = await Promise.all([
      supabase.from('shops').select('name').eq('id', membership.shop_id).single(),
      supabase.from('shop_members').select('user_id, display_name, role').eq('shop_id', membership.shop_id),
      supabase.from('shop_owner_invites').select('email').eq('shop_id', membership.shop_id).maybeSingle(),
    ]);
    setShopName(shop?.name ?? 'your shop');
    setBarbers(((team as Member[]) ?? []).filter((m) => m.user_id !== session?.user.id));
    setPendingEmail(invite?.email ?? null);
  }, [membership, session]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  function handToBarber(m: Member) {
    Alert.alert(`Make ${m.display_name} the owner?`, `${m.display_name} takes over ${shopName} right away, with full owner access.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Yes, ${m.display_name} takes over`,
        onPress: async () => {
          setBusy('transfer');
          const { error } = await supabase.rpc('transfer_shop_to_member', { p_shop: membership!.shop_id, p_new_owner: m.user_id });
          setBusy(null);
          if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
          await refresh(); // you're now a barber, so the screen below changes
          setMessage({ tone: 'success', text: `${m.display_name} now owns ${shopName}. You can delete your account.` });
        },
      },
    ]);
  }

  async function inviteByEmail() {
    const email = newOwnerEmail.trim().toLowerCase();
    setBusy('invite');
    const { error } = await supabase.rpc('invite_shop_owner', { p_shop: membership!.shop_id, p_email: email });
    setBusy(null);
    if (error) return setMessage({ tone: 'error', text: friendlyError(error) });
    setNewOwnerEmail('');
    setMessage(null);
    await loadShop();
    Share.share({
      message:
        `I'm handing ${shopName} over to you on Shape Up.\n\n` +
        `1. Download the Shape Up app\n2. Create an account with this email: ${email}\n3. Tap "Take over ${shopName}"`,
    }).catch(() => {});
  }

  async function cancelInvite() {
    await supabase.from('shop_owner_invites').delete().eq('shop_id', membership!.shop_id);
    loadShop();
  }

  function chooseClose() {
    Alert.alert(
      `Close ${shopName} for good?`,
      'This deletes the shop, removes your barbers from it, and deletes its clients’ cut cards, bookings, notes and photos. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, the shop is closing', style: 'destructive', onPress: () => setCloseShop(true) },
      ],
    );
  }

  async function remove() {
    setBusy('delete');
    setMessage(null);
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST', body: { closeShop } });
    if (error) {
      setBusy(null);
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        return setMessage({ tone: 'error', text: body?.error ?? friendlyError(error) });
      }
      return setMessage({ tone: 'error', text: 'Couldn’t reach Shape Up to delete your account. Check your connection and try again.' });
    }
    await signOut();
    router.replace('/');
  }

  const shopDecided = !isOwner || Boolean(pendingEmail) || closeShop;

  return (
    <Screen>
      <Button title="‹ Back" variant="secondary" onPress={() => router.back()} />
      <Title>Delete my account</Title>
      <Body>This permanently deletes your Shape Up account. It can’t be undone.</Body>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {isOwner && (
        <Card>
          <Label>Step 1: Who takes over {shopName}?</Label>
          <Body>Your shop keeps running, with its team, clients and bookings. Choose its new owner:</Body>

          {pendingEmail ? (
            <>
              <Notice tone="success">
                {pendingEmail} will take over {shopName} when they sign in to Shape Up with that email. Until then your
                barbers and bookings keep working as normal.
              </Notice>
              <Button title="Choose someone else" variant="secondary" onPress={cancelInvite} />
            </>
          ) : closeShop ? (
            <>
              <Notice tone="error">{shopName} will be closed and all its data deleted.</Notice>
              <Button title="Keep the shop open instead" variant="secondary" onPress={() => setCloseShop(false)} />
            </>
          ) : (
            <>
              {barbers.length > 0 && <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>One of your barbers</Text>}
              {barbers.map((m) => (
                <Button
                  key={m.user_id}
                  title={`Make ${m.display_name} the owner`}
                  variant="secondary"
                  onPress={() => handToBarber(m)}
                  loading={busy === 'transfer'}
                />
              ))}

              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 }}>Someone else, by email</Text>
              <Field
                label="New owner’s email"
                value={newOwnerEmail}
                onChangeText={setNewOwnerEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="newowner@example.com"
              />
              <Button
                title="Hand over to this email"
                onPress={inviteByEmail}
                loading={busy === 'invite'}
                disabled={!newOwnerEmail.includes('@')}
              />

              <View style={{ marginTop: 10 }}>
                <Button title="My shop is closing" variant="danger" onPress={chooseClose} />
              </View>
            </>
          )}
        </Card>
      )}

      <Card>
        <Label>{isOwner ? 'Step 2: Delete your account' : 'What gets deleted'}</Label>
        <Body>• Your account, name, email and birthday</Body>
        <Body>• Your photos, including your profile photo and any photos sent to barbershops</Body>
        <Body>• Your recommendations, cut cards and appointments</Body>
        {membership && !isOwner && <Body>• You’ll be removed from your barbershop’s team</Body>}
      </Card>

      <Field
        label="Type DELETE to confirm"
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={shopDecided}
      />
      {!shopDecided && <Body muted>Choose who takes over your shop first.</Body>}
      <Button
        title="Permanently delete my account"
        variant="danger"
        onPress={remove}
        loading={busy === 'delete'}
        disabled={!shopDecided || confirm.trim().toUpperCase() !== 'DELETE'}
      />
    </Screen>
  );
}
