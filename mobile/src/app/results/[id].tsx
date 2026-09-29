import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Body, Button, Card, colors, Label, Loading, Notice, Screen, Title } from '@/components/ui';
import type { Cut, Recommendation } from '@/lib/recommendation';
import { friendlyError, supabase } from '@/lib/supabase';

type Row = { id: string; result: Recommendation; is_demo: boolean; created_at: string; answers: { want?: string } };

function Detail({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <View style={{ gap: 2 }}>
      <Label>{label}</Label>
      <Body>{text}</Body>
    </View>
  );
}

function CutCard({ cut, rank }: { cut: Cut; rank: number }) {
  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>
          #{rank}
          {rank === 1 ? ' · Best match' : ''}
          {cut.trending ? ' · 🔥 Trending' : ''}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{cut.name}</Text>
        <Body>{cut.whyItFits}</Body>
        {cut.matchesWhatYouWant ? <Body muted>{cut.matchesWhatYouWant}</Body> : null}
      </View>

      <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 16, gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: '#a8a29e' }}>TELL YOUR BARBER</Text>
        <Text style={{ fontSize: 17, lineHeight: 25, color: colors.inkText }}>“{cut.tellYourBarber}”</Text>
      </View>

      <Detail label="Styling" text={cut.styling} />
      <Detail label="Product" text={cut.product} />
      <Detail label="Upkeep" text={cut.upkeep} />
      <Detail label="Grow it out first?" text={cut.growOutFirst} />

      <Button
        title="Share with my barber"
        variant="secondary"
        onPress={() => Share.share({ message: `Here’s the haircut I want: ${cut.name}\n\n${cut.tellYourBarber}` })}
      />
    </Card>
  );
}

// A customer's recommendation: face shape, notes, 3 cuts and cuts to avoid.
export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('recommendations')
      .select('id, result, is_demo, created_at, answers')
      .eq('id', id)
      .single()
      .then(({ data, error }) => (error ? setError(friendlyError(error)) : setRow(data as Row)));
  }, [id]);

  if (error) {
    return (
      <Screen>
        <Title>Couldn’t open this recommendation</Title>
        <Notice tone="error">{error}</Notice>
        <Button title="Home" onPress={() => router.replace('/home')} />
      </Screen>
    );
  }
  if (!row) return <Loading />;
  const r = row.result;

  return (
    <Screen>
      <Button title="‹ Home" variant="secondary" onPress={() => router.replace('/home')} />
      <Title>Your haircuts</Title>
      <Body muted>{new Date(row.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Body>
      {row.is_demo && (
        <Notice tone="note">
          Demo results: the AI isn’t connected yet, so these are sample cuts, not based on your photos.
        </Notice>
      )}

      <Card>
        {row.answers?.want ? <Detail label="You asked for" text={row.answers.want} /> : null}
        <Detail label="Face shape" text={r.faceShape} />
        <Detail label="What we noticed" text={r.photoNote} />
        <Detail label="Your hair" text={r.hairRead} />
        <Detail label="Trending now" text={r.trendNote} />
      </Card>

      {r.cuts.map((cut, i) => (
        <CutCard key={`${cut.name}-${i}`} cut={cut} rank={i + 1} />
      ))}

      {r.avoid.length > 0 && (
        <View style={{ backgroundColor: colors.dangerSoft, borderRadius: 18, padding: 18, gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.danger }}>Cuts to avoid</Text>
          {r.avoid.map((a) => (
            <View key={a.name}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.danger }}>{a.name}</Text>
              <Text style={{ fontSize: 15, color: colors.danger }}>{a.why}</Text>
            </View>
          ))}
        </View>
      )}

      <Body muted center>Your photos were not saved. Sending a cut straight to your barbershop is coming next.</Body>
    </Screen>
  );
}
