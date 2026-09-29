import { Image } from 'expo-image';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Body, Button, Card, colors, Field, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { formatDate, type ClientCutCard, type ShopClient } from '@/lib/clients';
import { profilePhotoUrls } from '@/lib/photos';
import { friendlyError, supabase } from '@/lib/supabase';

const STATUS_LABEL: Record<string, string> = { new: 'New', seen: 'Seen', in_chair: 'In the chair', done: 'Done' };

// Readable hair details, e.g. "Wavy · Medium thickness · Cowlick".
function hairSummary(hair: ClientCutCard['hair']): string {
  const parts: string[] = [];
  if (hair.texture) parts.push(String(hair.texture));
  if (hair.thickness) parts.push(`${hair.thickness} strands`);
  if (hair.density) parts.push(`${hair.density} density`);
  if (Array.isArray(hair.workAround)) parts.push(...hair.workAround);
  return parts.join(' · ');
}

function Detail({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      <Body>{text}</Body>
    </View>
  );
}

// A single client, as their barbershop sees them.
export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loading: accountLoading, membership } = useAccount();
  const [client, setClient] = useState<ShopClient | null>(null);
  const [cards, setCards] = useState<ClientCutCard[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!membership || !id) return;
    const shop = membership.shop_id;
    const [{ data: list }, { data: cardRows }, { data: noteRow }] = await Promise.all([
      supabase.rpc('shop_clients', { p_shop: shop }),
      supabase.rpc('client_cut_cards', { p_shop: shop, p_customer: id }),
      supabase.from('client_notes').select('usual_cut').eq('shop_id', shop).eq('customer_id', id).maybeSingle(),
    ]);
    const found = ((list as ShopClient[] | null) ?? []).find((c) => c.customer_id === id) ?? null;
    setClient(found);
    setCards((cardRows as ClientCutCard[] | null) ?? []);
    setNote(noteRow?.usual_cut ?? '');
    if (found?.avatar_updated_at) {
      const urls = await profilePhotoUrls([found.customer_id]);
      setPhoto(urls[found.customer_id] ?? null);
    }
    setLoading(false);
  }, [membership, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveNote() {
    if (!membership || !id) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase
      .from('client_notes')
      .upsert({ shop_id: membership.shop_id, customer_id: id, usual_cut: note.trim() }, { onConflict: 'shop_id,customer_id' });
    setSaving(false);
    setMessage(error ? { tone: 'error', text: friendlyError(error) } : { tone: 'success', text: 'Usual cut saved.' });
  }

  async function removeSharedAccess() {
    if (!membership || !id) return;
    await supabase.from('shop_client_access').delete().eq('shop_id', membership.shop_id).eq('customer_id', id);
    router.back();
  }

  if (accountLoading) return <Loading />;
  if (!membership) return <Redirect href="/" />;
  if (loading) return <Loading />;

  if (!client) {
    return (
      <Screen>
        <Title>Client not found</Title>
        <Body muted>They may have removed your shop’s access.</Body>
        <Button title="Back to clients" onPress={() => router.back()} />
      </Screen>
    );
  }

  const latestCut = cards[0]?.cut.name;

  return (
    <Screen>
      <Button title="‹ Back to clients" variant="secondary" onPress={() => router.back()} />

      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ width: '100%', maxWidth: 420, aspectRatio: 1, borderRadius: 24, alignSelf: 'center' }}
          contentFit="cover"
        />
      ) : (
        <View style={{ alignSelf: 'center' }}>
          <Avatar name={client.first_name} size={140} />
        </View>
      )}

      <View style={{ gap: 4 }}>
        <Title>{client.first_name}</Title>
        <Body muted>
          {client.linked
            ? 'Linked to your shop'
            : client.shared
              ? 'Shared their cut card code with your shop'
              : 'Sent your shop a cut card'}
          {client.mine ? ' · Has picked you as their barber' : ''}
        </Body>
      </View>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card>
        <Field
          label="Usual cut"
          hint={
            latestCut
              ? `Only your shop sees this. Leave it empty to show the cut from their latest card (${latestCut}).`
              : 'Only your shop sees this.'
          }
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="e.g. #2 skin fade, 2 inches on top, textured, natural neckline"
        />
        <Button title="Save usual cut" onPress={saveNote} loading={saving} />
      </Card>

      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Cut cards</Text>
      {cards.length === 0 && (
        <Body muted>No cut cards yet. They appear here when this client sends one to your shop.</Body>
      )}
      {cards.map((card) => (
        <Card key={card.card_id}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: colors.text }}>{card.cut.name}</Text>
            <Text style={{ color: colors.muted }}>
              {[
                `Sent ${formatDate(card.created_at)}`,
                card.from_this_shop ? null : 'From another shop',
                card.barber_name ? `Barber: ${card.barber_name}` : null,
                card.status ? STATUS_LABEL[card.status] : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {card.cut.tellYourBarber ? (
            <View style={{ backgroundColor: colors.ink, borderRadius: 12, padding: 14, gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.8, color: '#a8a29e' }}>THE CUT</Text>
              <Text style={{ fontSize: 17, lineHeight: 24, color: colors.inkText }}>{card.cut.tellYourBarber}</Text>
            </View>
          ) : null}
          <Detail label="Hair" text={hairSummary(card.hair)} />
          <Detail label="Styling" text={card.cut.styling} />
          <Detail label="Product" text={card.cut.product} />
          <Detail label="Client’s note" text={card.customer_note} />
        </Card>
      ))}

      {client.shared && !client.linked && (
        <Button title="Remove from my clients" variant="danger" onPress={removeSharedAccess} />
      )}
    </Screen>
  );
}
