import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-[85vh] flex-col justify-between">
      <div className="pt-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-stone-500">Shape Up</p>
        <h1 className="mt-3 text-4xl font-bold leading-tight">Find the cut that fits you.</h1>
        <p className="mt-4 text-lg text-stone-600">
          Snap a photo, answer a few quick questions, and get 3 haircuts picked for your face and hair,
          plus a cut card that tells your barber exactly what to do.
        </p>
      </div>

      <div className="space-y-4 pb-4">
        <Link
          href="/start"
          className="block w-full rounded-2xl bg-stone-900 py-4 text-center text-lg font-semibold text-white active:bg-stone-700"
        >
          Get my recommendations
        </Link>
        <p className="text-center text-sm text-stone-500">
          Your photos are only used to make your recommendation. We never store them.
        </p>
      </div>
    </div>
  );
}
