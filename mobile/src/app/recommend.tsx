import { FunctionsHttpError } from '@supabase/supabase-js';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GuidedPhoto } from '@/components/GuidedPhoto';
import { usePhotoChecker } from '@/components/PhotoChecker';
import { Body, Button, Card, colors, Eyebrow, Loading, Notice, Screen, Title } from '@/components/ui';
import { useAccount } from '@/lib/account';
import { emptyAnswers, questions, type HairAnswers } from '@/lib/questions';
import { photoSession, type Photo } from '@/lib/recommendation';
import { friendlyError, supabase } from '@/lib/supabase';

type Allowance = { used: number; allowed: number; remaining: number; linked: boolean; unlimited: boolean };

const WANT_IDEAS = [
  'Keep some length on top',
  'Short and easy to manage',
  'A clean fade',
  'Something trendy',
  'Hide my receding hairline',
  'Not sure, surprise me',
];

// Steps: intro → what you want → each question → front photo → side photo → sending.
type Step = { kind: 'intro' } | { kind: 'want' } | { kind: 'question'; index: number } | { kind: 'front' } | { kind: 'side' } | { kind: 'sending' };

export default function Recommend() {
  const { loading, profile, membership } = useAccount();
  const { checker, check } = usePhotoChecker();
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [want, setWant] = useState('');
  const [answers, setAnswers] = useState<HairAnswers>(emptyAnswers);
  const [front, setFront] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('my_recommendation_allowance').then(({ data }) => {
      const row = (data as Allowance[] | null)?.[0];
      if (row) setAllowance(row);
    });
  }, []);

  if (loading) return <Loading />;
  if (!profile || membership) return <Redirect href="/" />;

  const totalSteps = questions.length + 4;
  const position =
    step.kind === 'want' ? 1 : step.kind === 'question' ? step.index + 2 : step.kind === 'front' ? questions.length + 2 : questions.length + 3;

  function back() {
    setError(null);
    if (step.kind === 'want') setStep({ kind: 'intro' });
    else if (step.kind === 'question') setStep(step.index === 0 ? { kind: 'want' } : { kind: 'question', index: step.index - 1 });
    else if (step.kind === 'front') setStep({ kind: 'question', index: questions.length - 1 });
    else if (step.kind === 'side') setStep({ kind: 'front' });
    else router.back();
  }

  function answer(id: keyof HairAnswers, value: string, multi?: boolean) {
    if (multi) {
      const current = answers.workAround;
      setAnswers({ ...answers, workAround: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
      return;
    }
    setAnswers({ ...answers, [id]: value });
    // Single-choice questions move on as soon as you tap.
    setTimeout(() => {
      if (step.kind === 'question') {
        setStep(step.index + 1 < questions.length ? { kind: 'question', index: step.index + 1 } : { kind: 'front' });
      }
    }, 150);
  }

  async function send(frontPhoto: Photo, side: Photo | null) {
    setStep({ kind: 'sending' });
    setError(null);
    const { data, error } = await supabase.functions.invoke('recommend', {
      body: { front: frontPhoto.base64, side: side?.base64 ?? null, answers, want: want.trim() },
    });
    if (error) {
      let message = 'Couldn’t reach Shape Up. Check your connection and try again.';
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => null);
        message = body?.error ?? friendlyError(error);
      }
      setError(message);
      setStep({ kind: 'side' });
      return;
    }
    // Keep the photos in memory only, for sending to the barbershop next.
    photoSession.recommendationId = data.id;
    photoSession.front = frontPhoto;
    photoSession.side = side;
    router.replace(`/results/${data.id}`);
  }

  const outOfRecommendations = allowance !== null && allowance.remaining <= 0;

  // ---------------- Screens ----------------

  if (step.kind === 'sending') {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 80 }}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Title>Your barber is taking a look…</Title>
          <Body muted center>Checking what’s trending and matching cuts to your face and hair. This takes about 30 to 60 seconds.</Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {checker}
      {step.kind !== 'intro' && (
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={styles.back}>
            <Text style={{ fontSize: 24, color: colors.muted }}>‹</Text>
          </Pressable>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${(position / totalSteps) * 100}%` }]} />
          </View>
        </View>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      {step.kind === 'intro' && (
        <>
          <Eyebrow>Shape Up</Eyebrow>
          <Title>Find the cut that fits you</Title>
          <Body>Tell us what you want, answer a few questions, and take a photo. You’ll get 3 haircuts picked for your face, hair and today’s trends, with exact instructions for your barber.</Body>
          {allowance && !allowance.unlimited && (
            <Notice tone={outOfRecommendations ? 'error' : 'info'}>
              {outOfRecommendations
                ? allowance.linked
                  ? 'You’ve used your 5 recommendations this month. You get 5 more on the 1st.'
                  : 'You’ve used your free recommendation. Join a partner barbershop to get 5 every month.'
                : allowance.linked
                  ? `${allowance.remaining} of ${allowance.allowed} recommendations left this month.`
                  : 'You get 1 free recommendation. Join a partner barbershop to get 5 every month.'}
            </Notice>
          )}
          <Card>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>🔒 About your photos</Text>
            <Body muted>
              They’re checked on your phone, sent securely to make your recommendation, then deleted. We never store
              them. If you later send a cut to your barbershop, we’ll ask you first.
            </Body>
          </Card>
          {outOfRecommendations && !allowance?.linked ? (
            <Button title="Find a barbershop" onPress={() => router.push('/shops')} />
          ) : (
            <Button title="Start" onPress={() => setStep({ kind: 'want' })} disabled={outOfRecommendations} />
          )}
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </>
      )}

      {step.kind === 'want' && (
        <>
          <Title>What kind of cut do you want?</Title>
          <Body muted>In a sentence or two. Anything helps: a length, a style, a celebrity, something you hate.</Body>
          <TextInput
            value={want}
            onChangeText={setWant}
            multiline
            maxLength={500}
            placeholder="e.g. Shorter on the sides but keep length on top. Nothing too high maintenance."
            placeholderTextColor={colors.muted}
            style={styles.want}
          />
          <Body muted>Ideas:</Body>
          <View style={styles.ideas}>
            {WANT_IDEAS.map((idea) => (
              <Pressable
                key={idea}
                accessibilityRole="button"
                onPress={() => setWant((w) => (w.trim() ? `${w.trim()}. ${idea}` : idea))}
                style={styles.idea}>
                <Text style={{ fontSize: 15, color: colors.text }}>+ {idea}</Text>
              </Pressable>
            ))}
          </View>
          <Button title="Next" onPress={() => setStep({ kind: 'question', index: 0 })} disabled={want.trim().length < 3} />
        </>
      )}

      {step.kind === 'question' &&
        (() => {
          const q = questions[step.index];
          const value = answers[q.id];
          return (
            <>
              <Title>{q.label}</Title>
              {q.help && <Body muted>{q.help}</Body>}
              <View style={{ gap: 10 }}>
                {q.choices.map((c) => {
                  const on = q.multi ? (value as string[]).includes(c.value) : value === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => answer(q.id, c.value, q.multi)}
                      style={[styles.choice, on && styles.choiceOn]}>
                      <Text style={[styles.choiceText, on && { color: colors.inkText }]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {q.multi && (
                <Button
                  title={answers.workAround.length ? 'Next' : 'None of these'}
                  onPress={() => setStep({ kind: 'question', index: step.index + 1 })}
                />
              )}
            </>
          );
        })()}

      {step.kind === 'front' && (
        <GuidedPhoto
          kind="front"
          check={check}
          onUse={(p) => {
            setFront(p);
            setStep({ kind: 'side' });
          }}
        />
      )}

      {step.kind === 'side' && front && (
        <GuidedPhoto kind="side" check={check} onUse={(p) => send(front, p)} onSkip={() => send(front, null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  bar: { flex: 1, height: 6, borderRadius: 99, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.ink },
  want: {
    minHeight: 130,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: 16,
    fontSize: 17,
    color: colors.text,
    textAlignVertical: 'top',
  },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  idea: { minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 14, justifyContent: 'center' },
  choice: { minHeight: 60, borderRadius: 16, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.card, paddingHorizontal: 18, justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontSize: 17, fontWeight: '500', color: colors.text },
});
