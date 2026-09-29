"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "./ui";

type Props = {
  front: File | null;
  side: File | null;
  onChange: (front: File | null, side: File | null) => void;
  onNext: () => void;
};

function PhotoPicker({
  label,
  hint,
  file,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  // Revoke the last preview URL when this picker goes away.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function handlePick(f: File | null) {
    setPreview(f ? URL.createObjectURL(f) : null);
    onPick(f);
  }

  return (
    <label className="block cursor-pointer">
      <span className="mb-2 block font-semibold">{label}</span>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-stone-300 bg-white">
        {file && preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="px-6 text-center text-stone-500">{hint}</span>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export default function PhotoStep({ front, side, onChange, onNext }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Take your photos</h1>
        <p className="mt-1 text-stone-600">
          Good light, face the camera, hair styled how you usually wear it.
        </p>
      </div>

      <PhotoPicker
        label="Front photo (required)"
        hint="Tap to take or choose a photo looking straight at the camera"
        file={front}
        onPick={(f) => onChange(f, side)}
      />
      <PhotoPicker
        label="Side photo (optional)"
        hint="Tap to add a side view. It helps us see your hairline and the back."
        file={side}
        onPick={(f) => onChange(front, f)}
      />

      <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
        🔒 Your photos are only used to create your recommendation and are deleted right after. We never store them.
      </p>

      <PrimaryButton disabled={!front} onClick={onNext}>
        Next
      </PrimaryButton>
    </div>
  );
}
