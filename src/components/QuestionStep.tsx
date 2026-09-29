"use client";

import type { HairAnswers, Question } from "@/lib/questions";
import { PrimaryButton } from "./ui";

type Props = {
  question: Question;
  answers: HairAnswers;
  onChange: (answers: HairAnswers) => void;
  onNext: () => void;
};

export default function QuestionStep({ question, answers, onChange, onNext }: Props) {
  const value = answers[question.id];

  function pick(choice: string) {
    if (question.multi) {
      const current = value as string[];
      const next = current.includes(choice) ? current.filter((c) => c !== choice) : [...current, choice];
      onChange({ ...answers, [question.id]: next });
    } else {
      onChange({ ...answers, [question.id]: choice });
      // Single-choice questions move on as soon as you tap.
      setTimeout(onNext, 150);
    }
  }

  const isSelected = (choice: string) =>
    question.multi ? (value as string[]).includes(choice) : value === choice;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{question.label}</h1>
        {question.help && <p className="mt-1 text-stone-600">{question.help}</p>}
      </div>

      <div className="space-y-3">
        {question.choices.map((c) => (
          <button
            key={c.value}
            onClick={() => pick(c.value)}
            className={`w-full rounded-2xl border-2 px-5 py-4 text-left text-lg font-medium transition-colors ${
              isSelected(c.value)
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white active:bg-stone-100"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {question.multi && (
        <PrimaryButton onClick={onNext}>
          {(value as string[]).length === 0 ? "None of these" : "Next"}
        </PrimaryButton>
      )}
    </div>
  );
}
