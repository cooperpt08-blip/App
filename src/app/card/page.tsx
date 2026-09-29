import { decodeCutCard } from "@/lib/cutCard";

export const metadata = { title: "Cut card · Shape Up" };

// The page a barber sees when a customer texts them a cut card link.
export default async function CardPage({ searchParams }: PageProps<"/card">) {
  const { c } = await searchParams;
  const card = typeof c === "string" ? decodeCutCard(c) : null;

  if (!card) {
    return (
      <div className="pt-20 text-center">
        <h1 className="text-2xl font-bold">Cut card not found</h1>
        <p className="mt-2 text-stone-600">This link looks incomplete. Ask your client to send it again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold uppercase tracking-widest text-stone-500">Shape Up · Cut card</p>
      <h1 className="text-3xl font-bold">{card.name}</h1>

      <div className="rounded-2xl bg-stone-900 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">The cut</p>
        <p className="mt-2 text-lg leading-relaxed">{card.tellYourBarber}</p>
      </div>

      {card.workAround.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Heads up</p>
          <p className="mt-1 text-amber-900">Client mentioned: {card.workAround.join(", ")}</p>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Upkeep</p>
          <p className="mt-0.5">{card.upkeep}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Grow out first?</p>
          <p className="mt-0.5">{card.growOutFirst}</p>
        </div>
      </div>
    </div>
  );
}
