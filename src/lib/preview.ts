import OpenAI, { toFile } from "openai";

// Runs on the server only. The API key is read from the OPENAI_API_KEY
// environment variable automatically, so it never appears in the code.
// Claude picks the cuts; OpenAI's image model draws the preview, because
// Claude can read photos but can't create them.
// Created on first use, because the OpenAI library refuses to start without a
// key and the app should still build and run before the key is added.
let openai: OpenAI | null = null;

export type PreviewCut = { name: string; tellYourBarber: string; styling: string };

export class PreviewError extends Error {}

function buildPrompt(cut: PreviewCut, texture: string): string {
  return `Edit this photo so the person has a new haircut: ${cut.name}.

How the barber cuts it: ${cut.tellYourBarber}
How it's styled: ${cut.styling}

Keep their natural ${texture || ""} hair texture and their current hair color.
Change ONLY the hair on their head. Keep everything else exactly the same: their face, facial features, skin tone, expression, facial hair, glasses, clothing, background, camera angle, and lighting.
It must look like a real, unedited photo of the same person right after a fresh haircut.`;
}

// PRIVACY: the photo is sent to OpenAI to draw the preview and is never saved
// by us. Nothing is written to disk or a database.
export async function renderPreview(photo: Buffer, cut: PreviewCut, texture: string): Promise<string> {
  try {
    openai ??= new OpenAI();
    const result = await openai.images.edit({
      model: "gpt-image-2.5-sunburst",
      image: await toFile(photo, "photo.jpg", { type: "image/jpeg" }),
      prompt: buildPrompt(cut, texture),
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 85,
    });
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new PreviewError("We couldn't make a preview this time. Please try again.");
    return `data:image/jpeg;base64,${b64}`;
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.code === "moderation_blocked") {
      throw new PreviewError("We couldn't make a preview from this photo. Try a different photo.");
    }
    throw error;
  }
}
