"use client";

import { useState } from "react";
import type { Cut, Recommendation } from "@/lib/recommendation";
import { encodeCutCard, makeCutCard } from "@/lib/cutCard";
import { PrimaryButton, SecondaryButton } from "./ui";

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-0.5 text-stone-800">{text}</p>
    </div>
  );
}

function Preview({ cut, texture, photo }: { cut: Cut; texture: string; photo: Blob }) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function render() {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", photo, "photo.jpg");
      form.append(
        "cut",
        JSON.stringify({ name: cut.name, tellYourBarber: cut.tellYourBarber, styling: cut.styling }),
      );
      form.append("texture", texture);
      const res = await fetch("/api/preview", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setImage(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (image) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={`You with a ${cut.name}`} className="w-full rounded-xl" />
        <p className="mt-2 text-center text-xs text-stone-500">
          AI preview. Your real cut may look a little different.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-stone-100 py-10 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-stone-900" />
        <p className="font-semibold">Drawing your new look…</p>
        <p className="text-sm text-stone-500">This takes about 30 seconds.</p>
      </div>
    );
  }

  return (
    <div>
      <PrimaryButton onClick={render}>✨ See it on me</PrimaryButton>
      {error && <p className="mt-2 text-center text-sm text-red-700">{error}</p>}
    </div>
  );
}

function CutResult({
  cut,
  rank,
  workAround,
  texture,
  photo,
}: {
  cut: Cut;
  rank: number;
  workAround: string[];
  texture: string;
  photo: Blob | null;
}) {
  const [status, setStatus] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/card?c=${encodeCutCard(makeCutCard(cut, workAround))}`;
    const text = `Here's the haircut I want: ${cut.name}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My cut card", text, url });
        return;
      } catch {
        // The customer closed the share sheet. Fall through to copying.
      }
    }
    await navigator.clipboard.writeText(url);
    setStatus("Link copied. Paste it in a text to your barber.");
  }

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
      <div>
        <p className="text-sm font-semibold text-stone-500">#{rank}{rank === 1 ? " · Best match" : ""}</p>
        <h3 className="text-xl font-bold">{cut.name}</h3>
        <p className="mt-1 text-stone-700">{cut.whyItFits}</p>
      </div>

      {photo && <Preview cut={cut} texture={texture} photo={photo} />}

      <div className="rounded-xl bg-stone-900 p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Tell your barber</p>
        <p className="mt-1">&ldquo;{cut.tellYourBarber}&rdquo;</p>
      </div>

      <Detail label="Styling" text={cut.styling} />
      <Detail label="Product" text={cut.product} />
      <Detail label="Upkeep" text={cut.upkeep} />
      <Detail label="Grow it out first?" text={cut.growOutFirst} />

      <SecondaryButton onClick={share}>Send cut card to my barber</SecondaryButton>
      {status && <p className="text-center text-sm text-stone-600">{status}</p>}
    </div>
  );
}

export default function Results({
  result,
  workAround,
  texture,
  photo,
  onRestart,
}: {
  result: Recommendation;
  workAround: string[];
  texture: string;
  photo: Blob | null;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Your haircuts</h1>
        <p className="mt-1 text-sm text-stone-500">
          We didn&apos;t keep your photos. Previews use the copy on your phone, which is cleared when you
          leave this page.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl bg-stone-100 p-5">
        <Detail label="Face shape" text={result.faceShape} />
        <Detail label="What we noticed" text={result.photoNote} />
        <Detail label="Your hair" text={result.hairRead} />
      </div>

      {result.cuts.map((cut, i) => (
        <CutResult
          key={cut.name}
          cut={cut}
          rank={i + 1}
          workAround={workAround}
          texture={texture}
          photo={photo}
        />
      ))}

      {result.avoid.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-5">
          <h2 className="font-bold text-red-900">Cuts to avoid</h2>
          {result.avoid.map((a) => (
            <div key={a.name}>
              <p className="font-semibold text-red-900">{a.name}</p>
              <p className="text-red-800">{a.why}</p>
            </div>
          ))}
        </div>
      )}

      <SecondaryButton onClick={onRestart}>Start over</SecondaryButton>
    </div>
  );
}
