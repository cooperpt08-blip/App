import { z } from "zod";

// The exact shape of what Claude sends back. The Claude API is told to follow
// this schema, so the results screen can rely on every field being there.

export const CutSchema = z.object({
  name: z.string().describe("Common name of the haircut"),
  whyItFits: z.string().describe("1-2 sentences on why it suits this person"),
  tellYourBarber: z
    .string()
    .describe(
      "Exact words to say to the barber, with clipper guard numbers and lengths in inches for top, sides, and back, plus the fade/taper and neckline",
    ),
  styling: z.string().describe("How to style it day to day, step by step"),
  product: z.string().describe("Product type to use, and how much"),
  upkeep: z.string().describe("How often to get it cut to keep the shape"),
  growOutFirst: z
    .string()
    .describe(
      "Whether they need to grow any part out first, and for how long. Say 'No' if they can get it today.",
    ),
});

export const RecommendationSchema = z.object({
  faceShape: z.string(),
  photoNote: z
    .string()
    .describe("Short note on what was noticed in the photos"),
  hairRead: z.string().describe("Short read on their hair"),
  cuts: z.array(CutSchema).describe("Exactly 3 cuts, best match first"),
  avoid: z
    .array(
      z.object({
        name: z.string(),
        why: z.string(),
      }),
    )
    .describe("1 or 2 cuts to avoid"),
});

export type Cut = z.infer<typeof CutSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
