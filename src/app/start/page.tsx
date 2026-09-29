"use client";

import { useState } from "react";
import PhotoStep from "@/components/PhotoStep";
import QuestionStep from "@/components/QuestionStep";
import Results from "@/components/Results";
import { PrimaryButton, ProgressBar } from "@/components/ui";
import { emptyAnswers, questions, type HairAnswers } from "@/lib/questions";
import type { Recommendation } from "@/lib/recommendation";
import { resizePhoto } from "@/lib/resizePhoto";

// Steps: 0 = photos, 1..N = questions, N+1 = notes, then loading / results.
const NOTES_STEP = questions.length + 1;
const TOTAL_STEPS = questions.length + 2;

export default function StartPage() {
  const [step, setStep] = useState(0);
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [answers, setAnswers] = useState<HairAnswers>(emptyAnswers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Recommendation | null>(null);

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(0, s - 1));

  async function submit() {
    if (!front) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("front", await resizePhoto(front), "front.jpg");
      if (side) form.append("side", await resizePhoto(side), "side.jpg");
      form.append("answers", JSON.stringify(answers));

      const res = await fetch("/api/recommend", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResult(data.recommendation);
      // Drop the photos from the page too, now that we're done with them.
      setFront(null);
      setSide(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setResult(null);
    setAnswers(emptyAnswers);
    setStep(0);
  }

  if (result) {
    return <Results result={result} workAround={answers.workAround} onRestart={restart} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center gap-4 text-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-stone-200 border-t-stone-900" />
        <p className="text-lg font-semibold">Your barber is taking a look…</p>
        <p className="text-stone-500">This usually takes 20 to 40 seconds.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {step > 0 && (
          <button onClick={back} className="text-2xl text-stone-600" aria-label="Back">
            ←
          </button>
        )}
        <ProgressBar step={step + 1} total={TOTAL_STEPS} />
      </div>

      {step === 0 && (
        <PhotoStep
          front={front}
          side={side}
          onChange={(f, s) => {
            setFront(f);
            setSide(s);
          }}
          onNext={next}
        />
      )}

      {step >= 1 && step < NOTES_STEP && (
        <QuestionStep
          key={questions[step - 1].id}
          question={questions[step - 1]}
          answers={answers}
          onChange={setAnswers}
          onNext={next}
        />
      )}

      {step === NOTES_STEP && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Anything else?</h1>
            <p className="mt-1 text-stone-600">Optional. A cut you liked before, something you hate, a job dress code…</p>
          </div>
          <textarea
            value={answers.notes}
            onChange={(e) => setAnswers({ ...answers, notes: e.target.value })}
            maxLength={500}
            rows={4}
            className="w-full rounded-2xl border-2 border-stone-200 bg-white p-4 text-lg outline-none focus:border-stone-900"
            placeholder="e.g. I want to keep some length on top"
          />
          {error && <p className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
          <PrimaryButton onClick={submit}>Get my haircuts</PrimaryButton>
        </div>
      )}
    </div>
  );
}
