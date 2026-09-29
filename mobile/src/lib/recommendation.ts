// What a recommendation looks like (matches the server's answer format).

export type Cut = {
  name: string;
  whyItFits: string;
  matchesWhatYouWant: string;
  trending: boolean;
  tellYourBarber: string;
  styling: string;
  product: string;
  upkeep: string;
  growOutFirst: string;
};

export type Recommendation = {
  faceShape: string;
  photoNote: string;
  hairRead: string;
  trendNote: string;
  cuts: Cut[];
  avoid: { name: string; why: string }[];
};

export type Photo = { uri: string; base64: string };

// The photos from the latest recommendation, kept only in the app's memory (never
// saved to the phone or our servers) so the customer can send them to their shop next.
export const photoSession: { recommendationId: string | null; front: Photo | null; side: Photo | null } = {
  recommendationId: null,
  front: null,
  side: null,
};
