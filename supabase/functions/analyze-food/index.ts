// Protein analysis via user-provided Gemini key OR server OpenAI key.
// User Gemini keys are passed per-request only — never stored server-side.

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
const GEMINI_MODEL = "gemini-2.0-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-gemini-key",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN ONLY from food photos.

1. If NOT food: is_food=false, empty food_name, empty items, zeros, explain in notes.
2. If food: list every visible component with realistic portions and protein_g per item.
3. Per-item confidence: low, medium, or high. Use conservative estimates when uncertain.
4. total_protein_g must equal sum of item protein_g (1 decimal).
5. Never hallucinate food not visible.`;

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
          protein_g: { type: "number" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "protein_g", "confidence"],
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
          protein_g: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "protein_g", "confidence"],
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
    const headerKey = req.headers.get("x-gemini-key");
    const geminiKey =
      body.gemini_api_key || body.validate_gemini_key || headerKey || null;

    if (body.validate_gemini_key || (body.validate_only && geminiKey)) {
      const key = String(body.validate_gemini_key || geminiKey);
      const check = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}?key=${encodeURIComponent(key)}`,
      );
      if (check.ok) return json({ ok: true });
      const errText = await check.text();
      return json({ ok: false, error: geminiErrorMessage(check.status, errText) });
    }

    const { image_base64, mime_type = "image/jpeg" } = body;
    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }

    if (geminiKey) {
      const raw = await callGemini(String(geminiKey), image_base64, mime_type);
      return json({ analysis: normalize(raw), model: GEMINI_MODEL, provider: "gemini" });
    }

    if (!OPENAI_API_KEY) {
      return json(
        {
          error:
            "No AI provider available. Add a Gemini API key in Settings or configure OpenAI on the server.",
        },
        503,
      );
    }

    const raw = await callOpenAI(image_base64, mime_type);
    return json({ analysis: normalize(raw), model: OPENAI_MODEL, provider: "openai" });
  } catch (err) {
    console.error("analyze-food error:", err);
    const message = err instanceof Error ? err.message : "Unexpected error analyzing the photo";
    return json({ error: message }, 500);
  }
});

async function callGemini(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            { text: "Analyze this image. Return JSON only." },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: GEMINI_SCHEMA,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(geminiErrorMessage(res.status, text));
  }

  const data = await res.json();
  const textPart = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textPart) throw new Error("Gemini returned an empty response.");
  return JSON.parse(textPart);
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
            { type: "text", text: "Analyze this image. Return JSON only." },
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
        message =
          "OpenAI billing is not active. Add a payment method at platform.openai.com, then retry.";
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

function normalize(raw: Record<string, unknown>) {
  if (!raw.is_food) {
    return {
      is_food: false,
      food_name: "",
      items: [],
      total_protein_g: 0,
      calories: 0,
      confidence: "low",
      notes: String(raw.notes ?? "This doesn't look like food."),
    };
  }

  const items = ((raw.items as Record<string, unknown>[]) ?? []).map((item) => ({
    name: String(item.name ?? "Unknown"),
    portion: String(item.portion ?? ""),
    protein_g: round1(Number(item.protein_g) || 0),
    confidence: item.confidence ?? "medium",
  }));

  const sum = round1(items.reduce((s, i) => s + i.protein_g, 0));
  const total = round1(Number(raw.total_protein_g) || sum);

  return {
    is_food: true,
    food_name: String(raw.food_name || "Meal"),
    items,
    total_protein_g: Math.abs(total - sum) > 2 ? sum : total,
    calories: Math.round(Number(raw.calories) || 0),
    confidence: raw.confidence ?? "medium",
    notes: String(raw.notes ?? ""),
  };
}

function geminiErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message ?? "";
    if (/API_KEY_INVALID|invalid.*api.*key|API key not valid|PERMISSION_DENIED/i.test(msg)) {
      return "Invalid Gemini API key. Check your key at aistudio.google.com/apikey";
    }
    if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      return "Gemini quota exceeded. Try again later.";
    }
    if (msg) return msg;
  } catch {
    /* default */
  }
  if (status === 403 || status === 401 || status === 400) {
    return "Invalid Gemini API key. Check your key at aistudio.google.com/apikey";
  }
  return `Gemini analysis failed (${status}). Please try again.`;
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
