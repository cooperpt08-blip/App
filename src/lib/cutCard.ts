import type { Cut } from "./recommendation";

// A cut card is the part of a recommendation the barber needs. It is packed
// into the share link itself, so nothing has to be saved on our side.

export type CutCard = {
  name: string;
  tellYourBarber: string;
  upkeep: string;
  growOutFirst: string;
  workAround: string[];
};

export function makeCutCard(cut: Cut, workAround: string[]): CutCard {
  return {
    name: cut.name,
    tellYourBarber: cut.tellYourBarber,
    upkeep: cut.upkeep,
    growOutFirst: cut.growOutFirst,
    workAround,
  };
}

export function encodeCutCard(card: CutCard): string {
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeCutCard(encoded: string): CutCard | null {
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const card = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof card?.name !== "string" || typeof card?.tellYourBarber !== "string") return null;
    return {
      name: card.name,
      tellYourBarber: card.tellYourBarber,
      upkeep: String(card.upkeep ?? ""),
      growOutFirst: String(card.growOutFirst ?? ""),
      workAround: Array.isArray(card.workAround) ? card.workAround.map(String) : [],
    };
  } catch {
    return null;
  }
}
