// Shape Up: AI haircut recommendations.
// Called by the app with the customer's photos, answers, and a short description
// of the cut they want. Returns 3 recommended cuts and cuts to avoid.
//
// Privacy: photos are passed to Claude and then dropped. They are never saved.
// Limits: no shop = 1 free recommendation ever; linked to a shop = 5 per month.
// No ANTHROPIC_API_KEY secret yet? It returns clearly-labeled demo results instead.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = 'claude-opus-5-5';
// Claude Opus 5.5 list prices (USD per million tokens) and web search ($10 per 1,000).
const PRICE_IN = 4 / 1_000_000;
const PRICE_OUT = 20 / 1_000_000;
const PRICE_SEARCH = 10 / 1000;
const TREND_DAYS = 7;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Answers = {
  texture: string;
  thickness: string;
  density: string;
  topLength: string;
  workAround: string[];
  look: string;
  stylingTime: string;
  cutFrequency: string;
};

// ---------- The shape of the answer Claude must return ----------
const str = { type: 'string' } as const;
const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['faceShape', 'photoNote', 'hairRead', 'trendNote', 'cuts', 'avoid'],
  properties: {
    faceShape: str,
    photoNote: { type: 'string', description: 'Short note on what you noticed in the photos (hair, hairline, head shape).' },
    hairRead: { type: 'string', description: 'Short read on their hair: texture, density, growth patterns.' },
    trendNote: { type: 'string', description: 'One or two sentences on what is trending right now that is relevant to them.' },
    cuts: {
      type: 'array',
      description: 'Exactly 3 cuts, best match first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'whyItFits', 'matchesWhatYouWant', 'trending', 'tellYourBarber', 'styling', 'product', 'upkeep', 'growOutFirst'],
        properties: {
          name: str,
          whyItFits: { type: 'string', description: '1-2 sentences on why it suits their face, hair and age.' },
          matchesWhatYouWant: { type: 'string', description: 'How this delivers what they described wanting.' },
          trending: { type: 'boolean', description: 'True if this cut is currently trending.' },
          tellYourBarber: {
            type: 'string',
            description: 'Exact words to say to the barber: clipper guard numbers, lengths in inches for top/sides/back, fade or taper type and height, neckline, scissors vs clippers.',
          },
          styling: { type: 'string', description: 'Daily styling steps that fit their styling time.' },
          product: { type: 'string', description: 'Product type and amount.' },
          upkeep: { type: 'string', description: 'How often to get it cut.' },
          growOutFirst: { type: 'string', description: 'Whether to grow anything out first and for how long, or "No".' },
        },
      },
    },
    avoid: {
      type: 'array',
      description: '1 or 2 cuts to avoid.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'why'],
        properties: { name: str, why: str },
      },
    },
  },
} as const;

function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--;
  return age;
}
function ageBracket(age: number | null) {
  if (age === null) return 'any age';
  if (age < 18) return 'teens';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 50) return '35-49';
  return '50+';
}

function textOf(message: Anthropic.Beta.BetaMessage) {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

// ---------- Step 1: current trends (web search, cached for a week) ----------
async function trendResearch(ai: Anthropic, look: string, texture: string, bracket: string) {
  const prompt = `Research haircut trends that are popular right now (this season, ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}).
Focus on cuts that suit someone who wants a "${look}" look, with ${texture} hair, age ${bracket}.
Search widely: barber and salon sites, men's and women's style magazines, trend roundups, and articles that report what is trending on TikTok, Instagram and Pinterest.
Then write a short briefing (under 250 words) for a barber: a bullet list of 6-10 specific trending cuts with one line each on who they suit and what makes them current. Plain text, no links.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: prompt }];
  let searches = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (let turn = 0; turn < 4; turn++) {
    const res = await ai.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      messages,
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: res.content });
      continue;
    }
    return { summary: textOf(res), searches, inputTokens, outputTokens };
  }
  return { summary: '', searches, inputTokens, outputTokens };
}

// ---------- Step 2: the recommendation ----------
const SYSTEM = `You are an experienced barber and stylist with 20 years behind the chair, cutting every hair type. A client shows you photos and tells you what they want. Recommend haircuts that suit their face shape, hair, age, lifestyle and what they asked for, and that feel current.

Rules:
- What the client says they want matters most. If it would not suit them, recommend the closest version that will, and say why kindly.
- Age matters: hair density, strand thickness and hairline often change with age. Choose cuts that suit their hair now and will keep working.
- "tellYourBarber" is read aloud to a barber: use real barber language with guard numbers, lengths in inches, fade/taper type and height, and neckline.
- Match styling to how much time they said they will spend. Account for everything they asked you to work around.
- Use the trend briefing to prefer cuts that are current, but never recommend a trend that won't suit them.
- Only comment on hair, head shape and face shape. Keep each field short enough to read on a phone.
- If a photo is unclear, still give your best recommendation and mention the limitation in photoNote.`;

function describe(a: Answers, want: string, age: number | null) {
  return [
    `What I want: ${want || 'Not sure, surprise me'}`,
    age !== null ? `Age: ${age}` : null,
    `Hair texture: ${a.texture}`,
    `Strand thickness: ${a.thickness}`,
    `Amount of hair: ${a.density}`,
    `Current length on top: ${a.topLength}`,
    `Things to work around: ${a.workAround.length ? a.workAround.join(', ') : 'nothing'}`,
    `Look I'm going for: ${a.look}`,
    `Daily styling time: ${a.stylingTime}`,
    `How often I get cut: ${a.cutFrequency}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function demoResult(a: Answers, want: string) {
  const fade = a.look.includes('professional') ? 'low taper' : 'mid skin fade';
  return {
    faceShape: 'Oval (demo)',
    photoNote: 'Demo result: the AI isn’t connected yet, so your photos weren’t analyzed.',
    hairRead: `${a.texture} hair, ${a.thickness} strands, ${a.density} density (from your answers).`,
    trendNote: 'Textured crops, modern mullets and soft tapers are popular right now (demo text).',
    cuts: [
      {
        name: 'Textured Crop',
        whyItFits: 'Short, textured top that works with most face shapes and hair types.',
        matchesWhatYouWant: `You asked for: “${want}”. This keeps it easy to style.`,
        trending: true,
        tellYourBarber: `#2 ${fade} on the sides, blend into about 2 inches on top, point-cut for texture, natural neckline.`,
        styling: 'Towel dry, a little sea salt spray, rough it forward with your fingers.',
        product: 'Dime-size matte clay.',
        upkeep: 'Every 3-4 weeks.',
        growOutFirst: 'No',
      },
      {
        name: 'Classic Taper',
        whyItFits: 'Clean and low maintenance, grows out neatly.',
        matchesWhatYouWant: 'A safe, polished option.',
        trending: false,
        tellYourBarber: '#3 low taper on the sides and back, scissor cut 2.5 inches on top, tapered neckline.',
        styling: 'Comb to the side with a little cream.',
        product: 'Small amount of light-hold cream.',
        upkeep: 'Every 4 weeks.',
        growOutFirst: 'No',
      },
      {
        name: 'Modern Quiff',
        whyItFits: 'Adds height and structure on top.',
        matchesWhatYouWant: 'A bolder take if you want something new.',
        trending: true,
        tellYourBarber: '#1 mid fade, 3-4 inches on top left longer at the front, textured with scissors.',
        styling: 'Blow dry up and back, then shape with product.',
        product: 'Pea-size pomade.',
        upkeep: 'Every 3 weeks.',
        growOutFirst: 'May need 3-4 more weeks on top if it’s short now.',
      },
    ],
    avoid: [{ name: 'Very tight buzz cut', why: 'Demo text: shows every irregularity in head shape.' }],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return reply(401, { error: 'Please sign in again.' });
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ---- Check the request ----
  const body = await req.json().catch(() => null);
  const front = typeof body?.front === 'string' ? body.front : '';
  const side = typeof body?.side === 'string' ? body.side : '';
  const want = String(body?.want ?? '').trim().slice(0, 500);
  const a = body?.answers ?? {};
  const answers: Answers = {
    texture: String(a.texture ?? '').slice(0, 50),
    thickness: String(a.thickness ?? '').slice(0, 50),
    density: String(a.density ?? '').slice(0, 50),
    topLength: String(a.topLength ?? '').slice(0, 50),
    workAround: Array.isArray(a.workAround) ? a.workAround.slice(0, 10).map((x: unknown) => String(x).slice(0, 50)) : [],
    look: String(a.look ?? '').slice(0, 50),
    stylingTime: String(a.stylingTime ?? '').slice(0, 50),
    cutFrequency: String(a.cutFrequency ?? '').slice(0, 50),
  };
  if (!front) return reply(400, { error: 'A front photo is required.' });
  if (front.length > 6_000_000 || side.length > 6_000_000) return reply(400, { error: 'That photo is too large.' });

  // ---- Monthly limit ----
  const { data: allowanceRows, error: allowanceError } = await db.rpc('recommendation_allowance_for', { p_user: user.id });
  if (allowanceError) return reply(500, { error: 'Something went wrong. Please try again.' });
  const allowance = allowanceRows?.[0];
  if (!allowance || allowance.remaining <= 0) {
    return reply(403, {
      error: allowance?.linked
        ? 'You’ve used your 5 recommendations for this month. You get 5 more on the 1st.'
        : 'You’ve used your free recommendation. Join a partner barbershop to get 5 every month.',
      limitReached: true,
    });
  }

  const { data: profile } = await db.from('profiles').select('shop_id, birth_date').eq('id', user.id).single();
  const age = ageFrom(profile?.birth_date ?? null);
  const storedAnswers = { ...answers, want };

  const save = async (result: unknown, extra: Record<string, unknown>) => {
    const { data, error } = await db
      .from('recommendations')
      .insert({ customer_id: user.id, shop_id: profile?.shop_id ?? null, answers: storedAnswers, result, ...extra })
      .select('id')
      .single();
    if (error) throw error;
    return data.id as string;
  };

  // ---- Demo mode (no AI key yet) ----
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    const result = demoResult(answers, want || 'something that suits me');
    const id = await save(result, { is_demo: true, model: 'demo' });
    return reply(200, { id, result, isDemo: true, remaining: allowance.remaining - 1 });
  }

  const ai = new Anthropic({ apiKey });
  let cost = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    // Step 1: trends, reused for a week per look / hair type / age group.
    const key = `${answers.look}|${answers.texture}|${ageBracket(age)}`.toLowerCase();
    const { data: cached } = await db
      .from('trend_cache')
      .select('summary, created_at')
      .eq('key', key)
      .gte('created_at', new Date(Date.now() - TREND_DAYS * 86_400_000).toISOString())
      .maybeSingle();
    let trends = cached?.summary ?? '';
    if (!trends) {
      const research = await trendResearch(ai, answers.look || 'modern', answers.texture || 'any', ageBracket(age));
      trends = research.summary;
      inputTokens += research.inputTokens;
      outputTokens += research.outputTokens;
      cost += research.searches * PRICE_SEARCH;
      if (trends) {
        await db.from('trend_cache').upsert({ key, summary: trends, searches: research.searches, created_at: new Date().toISOString() });
      }
    }

    // Step 2: the recommendation, from the photos, answers, age and trends.
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: 'Front photo:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: front } },
    ];
    if (side) {
      content.push(
        { type: 'text', text: 'Side photo:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: side } },
      );
    }
    content.push({
      type: 'text',
      text: `About me:\n${describe(answers, want, age)}\n\nCurrent trend briefing:\n${trends || '(not available right now)'}\n\nGive me exactly 3 recommended cuts, best first, and 1 or 2 cuts to avoid.`,
    });

    const res = await ai.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    inputTokens += res.usage.input_tokens;
    outputTokens += res.usage.output_tokens;
    cost += inputTokens * PRICE_IN + outputTokens * PRICE_OUT;

    if (res.stop_reason === 'refusal') {
      return reply(422, { error: 'We couldn’t analyze these photos. Try a clearer photo of your face and hair.' });
    }
    let result: unknown;
    try {
      result = JSON.parse(textOf(res));
    } catch {
      return reply(502, { error: 'Something went wrong building your recommendation. Please try again.' });
    }

    const id = await save(result, {
      is_demo: false,
      model: res.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: Number(cost.toFixed(5)),
    });
    return reply(200, { id, result, isDemo: false, remaining: allowance.remaining - 1 });
  } catch (e) {
    console.error('recommend failed', e);
    if (e instanceof Anthropic.RateLimitError) return reply(429, { error: 'We’re busy right now. Try again in a minute.' });
    if (e instanceof Anthropic.AuthenticationError) return reply(500, { error: 'The AI isn’t set up correctly. Please tell the Shape Up team.' });
    return reply(500, { error: 'Something went wrong. Please try again.' });
  }
});
