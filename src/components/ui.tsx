// Small shared building blocks so every screen looks the same.

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white active:bg-stone-700 disabled:bg-stone-300 ${props.className ?? ""}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-2xl border border-stone-300 bg-white py-3 font-semibold text-stone-800 active:bg-stone-100 ${props.className ?? ""}`}
    />
  );
}

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
      <div className="h-full bg-stone-900 transition-all" style={{ width: `${(step / total) * 100}%` }} />
    </div>
  );
}
