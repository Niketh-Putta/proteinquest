// Protein analysis via server Gemini key (primary) or OpenAI fallback.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN ONLY from food photos.

CRITICAL — SIZE DRIVES PROTEIN, NOT JUST FOOD TYPE:
- First estimate how much of each food is on the plate using visual cues: area on plate, thickness/height, stack depth, relative size vs utensils (fork ~19cm), hands, standard dinner plate (~26cm), bowl rim, packaging labels if visible.
- For each item set estimated_grams (cooked/edible weight). protein_g MUST be calculated from that weight × protein density for that food — NOT a generic "standard serving".
- Examples: a thin palm-sized chicken breast (~90g) ≈ 27g protein; a large double breast (~200g) ≈ 60g. A small yogurt cup (125g) ≠ a large tub (500g). Two eggs ≠ four eggs.
- If size is ambiguous, use conservative (lower) gram estimates and set confidence to low or medium.

Rules:
1. If NOT food: is_food=false, empty food_name, empty items, zeros, explain in notes.
2. If food: list every visible component. portion must describe size ("~120g, palm-sized", "half plate", "2 large slices").
3. Handle ANY food: cake, pizza, curry, shakes, snacks, restaurant meals, mixed plates, etc.
4. Per-item confidence: low, medium, or high.
5. total_protein_g must equal sum of item protein_g (1 decimal).
6. Never hallucinate food not visible.
7. Keep notes under 100 characters. No double quotes, backslashes, or line breaks inside any string field.`;

const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_food: { type: "boolean" },
    food_name: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          portion: { type: "string" },
          estimated_grams: { type: "number" },
          protein_g: { type: "number" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "estimated_grams", "protein_g", "confidence"],
      },
    },
    total_protein_g: { type: "number" },
    calories: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
  },
  required: [
    "is_food",
    "food_name",
    "items",
    "total_protein_g",
    "calories",
    "confidence",
    "notes",
  ],
};

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_food: { type: "BOOLEAN" },
    food_name: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          portion: { type: "STRING" },
          estimated_grams: { type: "NUMBER" },
          protein_g: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "estimated_grams", "protein_g", "confidence"],
      },
    },
    total_protein_g: { type: "NUMBER" },
    calories: { type: "NUMBER" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    notes: { type: "STRING" },
  },
  required: [
    "is_food",
    "food_name",
    "items",
    "total_protein_g",
    "calories",
    "confidence",
    "notes",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { image_base64, mime_type = "image/jpeg" } = body;
    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }

    if (GEMINI_API_KEY) {
      try {
        const { raw, model } = await callGeminiWithRetry(
          GEMINI_API_KEY,
          image_base64,
          mime_type,
        );
        return json({ analysis: normalize(raw), model, provider: "gemini" });
      } catch (geminiErr) {
        console.error("Gemini chain failed:", geminiErr);
        if (OPENAI_API_KEY) {
          console.warn("Falling back to OpenAI after Gemini failure");
          const raw = await callOpenAI(image_base64, mime_type);
          return json({ analysis: normalize(raw), model: OPENAI_MODEL, provider: "openai" });
        }
        throw geminiErr;
      }
    }

    if (!OPENAI_API_KEY) {
      return json({ error: "AI service is not configured. Please try again later." }, 503);
    }

    const raw = await callOpenAI(image_base64, mime_type);
    return json({ analysis: normalize(raw), model: OPENAI_MODEL, provider: "openai" });
  } catch (err) {
    console.error("analyze-food error:", err);
    const message = err instanceof Error ? err.message : "Unexpected error analyzing the photo";
    return json({ error: message }, 500);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(message: string, status?: number): boolean {
  if (status === 429 || status === 503 || status === 500) return true;
  return /JSON|malformed|empty response|Unterminated|Unexpected token|quota|RESOURCE_EXHAUSTED|high demand|overloaded|rate.?limit|temporarily unavailable/i.test(
    message,
  );
}

async function callGeminiWithRetry(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<{ raw: Record<string, unknown>; model: string }> {
  let lastErr: Error | null = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callGemini(apiKey, imageBase64, mimeType, model, attempt);
        return { raw, model };
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        const status = (lastErr as Error & { status?: number }).status;
        const retryable = isRetryableGeminiError(lastErr.message, status);
        const isLastAttempt = attempt === 2;
        console.warn(
          `Gemini ${model} attempt ${attempt + 1} failed:`,
          lastErr.message,
        );
        if (!retryable || isLastAttempt) break;
        await sleep(400 * (attempt + 1));
      }
    }
  }

  throw lastErr ?? new Error("Analysis failed.");
}

async function callGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  model: string,
  attempt = 0,
): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            {
              text:
                attempt === 0
                  ? "Analyze this image. Estimate each food's size/weight from the photo first, then calculate protein from that weight. Return valid JSON only. Do not use double quotes inside string values."
                  : "Analyze this image for protein. Return ONLY compact valid JSON matching the schema. Keep notes under 80 characters. No quotes or newlines inside strings.",
            },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: attempt === 0 ? 0.2 : 0.1,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(geminiErrorMessage(res.status, text)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) throw new Error("Gemini returned an empty response.");
  return parseGeminiJson(textPart);
}

function parseGeminiJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (first) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        /* try repair */
      }
    }

    const repaired = repairTruncatedJson(cleaned);
    if (repaired) {
      try {
        return JSON.parse(repaired);
      } catch {
        /* fall through */
      }
    }

    const msg = first instanceof Error ? first.message : String(first);
    throw new Error(
      /Unterminated string|Unexpected token|JSON/i.test(msg)
        ? "AI returned a malformed response. Please try again."
        : msg,
    );
  }
}

/** Close brackets/strings when Gemini truncates mid-response. */
function repairTruncatedJson(raw: string): string | null {
  if (!raw.startsWith("{")) return null;
  let s = raw.replace(/,\s*$/, "");
  const quoteCount = (s.match(/(?<!\\)"/g) ?? []).length;
  if (quoteCount % 2 === 1) s += '"';
  const opens = (s.match(/[\[{]/g) ?? []).length;
  const closes = (s.match(/[\]}]/g) ?? []).length;
  for (let i = 0; i < opens - closes; i++) {
    s += s.lastIndexOf("[") > s.lastIndexOf("{") ? "]" : "}";
  }
  return s;
}

async function callOpenAI(
  imageBase64: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: 1200,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "protein_analysis",
          strict: true,
          schema: OPENAI_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this image. Estimate each food's size/weight from the photo first, then calculate protein from that weight. Return JSON only.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("OpenAI error:", openaiRes.status, errText);
    let message = "AI analysis failed. Please try again.";
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.code === "billing_not_active") {
        message = "AI service unavailable. Please try again later.";
      } else if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      /* default */
    }
    throw new Error(message);
  }

  const completion = await openaiRes.json();
  return JSON.parse(completion.choices[0].message.content);
}

function sanitizeField(value: unknown, maxLen = 120): string {
  return String(value ?? '')
    .replace(/[\r\n\t\\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function normalize(raw: Record<string, unknown>) {
  if (!raw.is_food) {
    return {
      is_food: false,
      food_name: '',
      items: [],
      total_protein_g: 0,
      calories: 0,
      confidence: 'low',
      notes: sanitizeField(raw.notes, 100) || "This doesn't look like food.",
    };
  }

  const items = ((raw.items as Record<string, unknown>[]) ?? []).map((item) => ({
    name: sanitizeField(item.name, 60) || 'Unknown',
    portion: sanitizeField(item.portion, 80),
    estimated_grams: Math.round(Number(item.estimated_grams) || 0) || undefined,
    protein_g: round1(Number(item.protein_g) || 0),
    confidence: item.confidence ?? 'medium',
  }));

  const sum = round1(items.reduce((s, i) => s + i.protein_g, 0));
  const total = round1(Number(raw.total_protein_g) || sum);

  return {
    is_food: true,
    food_name: sanitizeField(raw.food_name, 80) || 'Meal',
    items,
    total_protein_g: Math.abs(total - sum) > 2 ? sum : total,
    calories: Math.round(Number(raw.calories) || 0),
    confidence: raw.confidence ?? 'medium',
    notes: sanitizeField(raw.notes, 100),
  };
}

function geminiErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message ?? "";
    if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      return "AI quota exceeded. Try again later.";
    }
    if (/high demand|overloaded|temporarily unavailable/i.test(msg)) {
      return "AI is busy right now. Try again in a moment.";
    }
    if (msg) return msg;
  } catch {
    /* default */
  }
  if (status === 429 || status === 503) {
    return "AI is busy right now. Try again in a moment.";
  }
  return `AI analysis failed (${status}). Please try again.`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
