import OpenAI from "openai";
import { z } from "zod";
import { PreviewError, renderPreview } from "@/lib/preview";

// Drawing a photo-realistic preview can take up to a minute.
export const maxDuration = 120;

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const CutSchema = z.object({
  name: z.string().max(200),
  tellYourBarber: z.string().max(2000),
  styling: z.string().max(2000),
});

// PRIVACY: the photo arrives here, is passed to the image model, and is never
// written to disk or a database. Once this request finishes it is gone.
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) throw new PreviewError("A photo is required.");
    if (photo.type !== "image/jpeg" || photo.size > MAX_PHOTO_BYTES) {
      throw new PreviewError("That photo can't be used. Please start over.");
    }

    const cut = CutSchema.safeParse(JSON.parse(String(form.get("cut") ?? "{}")));
    if (!cut.success) throw new PreviewError("Something went wrong. Please try again.");
    const texture = String(form.get("texture") ?? "").slice(0, 50);

    const image = await renderPreview(Buffer.from(await photo.arrayBuffer()), cut.data, texture);
    return Response.json({ image });
  } catch (error) {
    if (error instanceof PreviewError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof OpenAI.AuthenticationError) {
      console.error("OpenAI API key is missing or invalid");
    } else if (error instanceof OpenAI.RateLimitError) {
      return Response.json({ error: "We're busy right now. Try again in a minute." }, { status: 429 });
    } else {
      console.error("Preview failed", error);
    }
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
