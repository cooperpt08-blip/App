import Anthropic from "@anthropic-ai/sdk";
import { getRecommendation, RecommendationError, type PhotoInput } from "@/lib/claude";
import { z } from "zod";

// Claude can take up to a minute to look at the photos and think.
export const maxDuration = 120;

const AnswersSchema = z.object({
  texture: z.string().max(50),
  thickness: z.string().max(50),
  density: z.string().max(50),
  topLength: z.string().max(50),
  workAround: z.array(z.string().max(50)).max(10),
  look: z.string().max(50),
  stylingTime: z.string().max(50),
  cutFrequency: z.string().max(50),
  notes: z.string().max(500),
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

async function readPhoto(file: FormDataEntryValue | null): Promise<PhotoInput | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const mediaType = ALLOWED_TYPES.find((t) => t === file.type);
  if (!mediaType) throw new RecommendationError("Photos must be JPEG, PNG, or WebP.");
  if (file.size > MAX_PHOTO_BYTES) throw new RecommendationError("That photo is too large.");
  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  return { mediaType, data };
}

// PRIVACY: photos arrive here, are passed to Claude, and are never written to
// disk or a database. Once this request finishes they are gone.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const front = await readPhoto(form.get("front"));
    const side = await readPhoto(form.get("side"));
    if (!front) throw new RecommendationError("A front photo is required.");

    const parsed = AnswersSchema.safeParse(JSON.parse(String(form.get("answers") ?? "{}")));
    if (!parsed.success) throw new RecommendationError("Please answer all the questions.");
    const answers = parsed.data;
    const recommendation = await getRecommendation(front, side, answers);
    return Response.json({ recommendation });
  } catch (error) {
    if (error instanceof RecommendationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude API key is missing or invalid");
    } else if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "We're busy right now. Try again in a minute." }, { status: 429 });
    } else {
      console.error("Recommendation failed", error);
    }
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
