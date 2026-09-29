import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { HairAnswers } from "./questions";
import { RecommendationSchema, type Recommendation } from "./recommendation";

// Runs on the server only. The API key is read from the ANTHROPIC_API_KEY
// environment variable automatically, so it never appears in the code.
const client = new Anthropic();

const SYSTEM_PROMPT = `You are an experienced barber with 20 years behind the chair, cutting every hair type. A customer shows you photos of themselves and answers a few questions. Recommend haircuts that suit their face shape, hair type, lifestyle, and the look they want.

Be specific and practical:
- "tellYourBarber" is read out loud to a barber, so use real barber language: clipper guard numbers (e.g. "#2 on the sides"), lengths in inches for the top, fade or taper type and height, how to finish the neckline, and whether to use scissors or clippers on top.
- Match styling advice to how much time they said they will spend.
- Account for everything they asked you to work around (cowlick, receding hairline, thinning, glasses, beard).
- Only recommend cuts that work with their current length or say clearly how long to grow out first.
- Keep every field short enough to read on a phone.

If a photo is unclear, still give your best recommendation and mention the limitation in photoNote. Do not comment on anything other than hair, head shape, and face shape.`;

export type PhotoInput = { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };

function describeAnswers(a: HairAnswers): string {
  return [
    `Hair texture: ${a.texture}`,
    `Strand thickness: ${a.thickness}`,
    `Amount of hair: ${a.density}`,
    `Current length on top: ${a.topLength}`,
    `Things to work around: ${a.workAround.length ? a.workAround.join(", ") : "nothing"}`,
    `Look they want: ${a.look}`,
    `Daily styling time: ${a.stylingTime}`,
    `How often they get cut: ${a.cutFrequency}`,
    `Their notes: ${a.notes.trim() || "none"}`,
  ].join("\n");
}

export class RecommendationError extends Error {}

export async function getRecommendation(
  front: PhotoInput,
  side: PhotoInput | null,
  answers: HairAnswers,
): Promise<Recommendation> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: "Front photo:" },
    { type: "image", source: { type: "base64", media_type: front.mediaType, data: front.data } },
  ];
  if (side) {
    content.push(
      { type: "text", text: "Side photo:" },
      { type: "image", source: { type: "base64", media_type: side.mediaType, data: side.data } },
    );
  }
  content.push({
    type: "text",
    text: `Here are my answers:\n${describeAnswers(answers)}\n\nGive me exactly 3 recommended cuts ranked best first, and 1 or 2 cuts to avoid.`,
  });

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(RecommendationSchema) },
    // If the main model declines, Anthropic retries on a suitable backup model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new RecommendationError("We couldn't analyze these photos. Try a different, clearer photo.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new RecommendationError("Something went wrong building your recommendation. Please try again.");
  }
  return response.parsed_output;
}
