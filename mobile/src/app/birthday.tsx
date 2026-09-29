import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/Segmented';
import { Body, Button, Card, Eyebrow, Field, Label, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { hasPendingJoin } from '@/lib/pendingJoin';
import { friendlyError, supabase } from '@/lib/supabase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns "YYYY-MM-DD", or an explanation of what's wrong.
function checkBirthday(month: number | null, day: string, year: string): { date?: string; problem?: string } {
  const d = Number(day);
  const y = Number(year);
  if (month === null || !day || year.length !== 4) return { problem: '' };
  const date = new Date(y, month, d);
  if (!Number.isInteger(d) || date.getMonth() !== month || date.getDate() !== d || y < 1900) {
    return { problem: 'That date doesn’t exist. Check the day and year.' };
  }
  const thirteen = new Date();
  thirteen.setFullYear(thirteen.getFullYear() - 13);
  if (date > thirteen) return { problem: 'You must be at least 13 to use Shape Up.' };
  return { date: `${y}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

// Customers add their birthday once, when they sign up.
export default function Birthday() {
  const { profile, refresh } = useAccount();
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { date, problem } = checkBirthday(month, day, year);

  async function save() {
    if (!date || !profile) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('profiles').update({ birth_date: date }).eq('id', profile.id);
    setBusy(false);
    if (error) return setError(friendlyError(error));
    await refresh();
    // Scanned a shop's QR code before signing up: the front door links them to it.
    // Already linked: go home. Otherwise: help them pick a barbershop on the map.
    if (await hasPendingJoin()) router.replace('/');
    else if (profile.shop_id) router.replace('/home');
    else router.replace('/shops?welcome=1');
  }

  return (
    <Screen>
      <Eyebrow>Almost done</Eyebrow>
      <Title>When’s your birthday?</Title>
      <Card>
        <Body>
          Hair changes with age: strand thickness, how much hair you have, and your hairline. Knowing your age helps
          us recommend cuts that suit your hair today and will keep working as it changes.
        </Body>
        <Body muted>Private: your barbershop doesn’t see it.</Body>
      </Card>

      <View style={{ gap: 8 }}>
        <Label>Month</Label>
        <Chips options={MONTHS.map((m, i) => ({ value: i, label: m }))} value={month ?? -1} onChange={setMonth} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Day" value={day} onChangeText={(t) => setDay(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={2} placeholder="15" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label="Year" value={year} onChangeText={(t) => setYear(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={4} placeholder="1998" />
        </View>
      </View>

      {problem ? <Notice tone="error">{problem}</Notice> : null}
      {error && <Notice tone="error">{error}</Notice>}
      <Button title="Continue" onPress={save} loading={busy} disabled={!date} />
    </Screen>
  );
}
