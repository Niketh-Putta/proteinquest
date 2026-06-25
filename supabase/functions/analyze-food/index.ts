// Protein analysis via server Gemini key (primary) or OpenAI fallback.

import {
  lookupCalorieDensity,
  lookupProteinDensity,
  proteinFromDensity,
} from "../_shared/protein-density.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-lite",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN ONLY from food photos.

IMPORTANT BIAS (visual estimates only): Err slightly LOW, not high. Photos exaggerate portion size. When uncertain, pick the lower plausible weight. Users strongly prefer underestimates to overestimates. Never inflate totals to "be safe".

WORK IN 5 STEPS (reason internally, output final JSON only):
0. LABEL / TEXT DETECTION (do this FIRST — highest priority):
   - Scan the image for ANY readable text: nutrition facts panels, supplement labels, packaging, barcodes, macro-tracking app screenshots, restaurant menus with macros.
   - OCR-style: read every number near "Protein", "PRO", "P:", "prot", or inside a protein row on a nutrition label.
   - Distinguish "per serving" vs "per container" vs "per 100g". If the whole package/product shown matches one serving, use per-serving protein. If multiple servings visible, multiply accordingly.
   - If explicit protein grams are visible with high confidence → set protein_source="label", label_protein_g to that value, and USE IT as total_protein_g. Do NOT replace label values with visual portion math.
   - Label wins over visual estimation. A nutrition label showing "Protein 50g" means total_protein_g≈50 even if the food photo alone looks smaller.
   - Set items to reflect the labeled product (e.g. one item "Protein powder (label)" with protein_g matching label). estimated_grams optional when source is label.
1. IDENTIFY every visible food component (skip if step 0 found authoritative label text). Separate visible items from likely hidden ingredients (sauce, oil, cheese dust, marinade). Note cooking method (grilled, fried, baked) — affects weight more than protein density.
2. ESTIMATE PORTION SIZE for each item using visual anchors (only when protein_source is "visual" or "mixed"):
   - Standard dinner plate ~26cm; fork ~19cm; palm ~10cm wide
   - Palm-sized chicken breast (cooked) ~90-110g; large breast ~130-150g (not 200g+ unless clearly huge)
   - Sliced/strip chicken: count strips × ~15-18g each (6 strips ≈90-108g, NOT full plate weight)
   - 1 large egg ~50g (~6g protein); 2 eggs ~100g (~13g protein)
   - Deck-of-cards meat portion ~75-85g; fist-sized rice/pasta ~120-140g cooked
   - Greens/kale bed under protein: ~40-70g (shares plate with protein above — do NOT add full plate weight)
   - Protein bar ~60g; yogurt cup small ~125g, large ~170g
   - Camera angle makes food look 15-25% larger — adjust grams DOWN accordingly
3. CALCULATE protein_g = estimated_grams × (protein per 100g for that food) / 100
   Densities: chicken breast 31, ground beef 26, salmon 25, egg 13, greek yogurt 10, tofu 17, kale/spinach 3, rice 2.7, cheese 25, protein bar 30
4. SUM all item protein_g → total_protein_g (must match within 0.5g)
5. ESTIMATE total meal calories: read from labels if visible; otherwise sum item kcal from portion weight (typical cooked kcal/100g: chicken 165, beef 250, fish 200, egg 155, rice 130, greens 35, cheese 400)

Rules:
- protein_source: "label" when nutrition label/packaging/on-screen text provides protein grams; "visual" when estimating from food appearance only; "mixed" when both exist (label wins for total).
- label_protein_g: set when step 0 finds explicit protein on a label or screen; null/omit otherwise.
- If NOT food: is_food=false, empty food_name, empty items, zeros, protein_source="visual", explain in notes.
- If food: list protein-bearing components only (chicken, eggs, meat, fish, tofu, beans, cheese, yogurt). Skip zero-protein garnishes (lemon wedge, herbs, pickles).
- LAYERED PLATES: items share plate space — do NOT assign full plate area to each item. Greens under chicken are typically 40-80g, not equal to the protein portion.
- Do NOT double-count: one chicken portion per plate unless multiple distinct pieces are clearly separate servings.
- portion must describe size AND method ("~110g grilled, 5 strips", "~60g sautéed bed under chicken").
- estimated_grams = cooked edible weight only. Typical dinner plate total food ~180-320g (not 450g+ unless clearly a large meal).
- Per-item confidence: low (ambiguous size), medium (reasonable estimate), high (clear size + familiar food).
- Never hallucinate food not visible. Hidden ingredients only if strongly implied (curry sauce, burger patty under bun).
- Keep notes under 100 characters. No double quotes, backslashes, or line breaks inside strings.

Few-shot calibration examples (do NOT copy blindly — adapt to the photo):
A) Grilled chicken strips (5-6 strips ~100g) + sautéed kale (~60g) + light parmesan (~3g):
   chicken 100g×31%=31g, kale 60g×3%=1.8g, cheese 3g×25%=0.8g → total ~34g, confidence medium
B) 2 scrambled eggs (~100g) + toast (~30g):
   eggs 13g, toast 2.7g → total ~16g
C) Chicken curry bowl: visible chicken ~100g (31g) + sauce/veg ~180g (5g) → total ~36g
D) Empty plate or non-food → is_food=false
E) Nutrition label photo showing "Protein 50g" per serving, whole product visible:
   protein_source="label", label_protein_g=50, one item from label → total_protein_g=50, confidence high
F) Supplement tub label "24g protein per scoop" with one scoop shown → label_protein_g=24, total 24g
G) Macro app screenshot showing "Protein: 48g" for logged meal → label_protein_g=48, trust screen text`;

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
    label_protein_g: { type: "number" },
    protein_source: { type: "string", enum: ["label", "visual", "mixed"] },
  },
  required: [
    "is_food",
    "food_name",
    "items",
    "total_protein_g",
    "calories",
    "confidence",
    "notes",
    "protein_source",
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
    label_protein_g: { type: "NUMBER" },
    protein_source: { type: "STRING", enum: ["label", "visual", "mixed"] },
  },
  required: [
    "is_food",
    "food_name",
    "items",
    "total_protein_g",
    "calories",
    "confidence",
    "notes",
    "protein_source",
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
          try {
            console.warn("Falling back to OpenAI after Gemini failure");
            const raw = await callOpenAI(image_base64, mime_type);
            return json({ analysis: normalize(raw), model: OPENAI_MODEL, provider: "openai" });
          } catch {
            throw geminiErr;
          }
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

function supportsThinking(model: string): boolean {
  return /gemini-2\.5-(flash|pro)/i.test(model);
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

  const generationConfig: Record<string, unknown> = {
    temperature: attempt === 0 ? 0.15 : 0.1,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: GEMINI_SCHEMA,
  };

  if (attempt === 0 && supportsThinking(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 256 };
  }

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
                  ? "Analyze this image for protein. Step 0: read any nutrition labels, packaging text, or on-screen macros (OCR). If label shows protein grams, use that as primary source (protein_source=label). Otherwise Step 1-4: identify foods, estimate grams conservatively (prefer lower end), apply density, sum. Return valid JSON only."
                  : "Analyze this image for protein. Check labels/text first. Estimate visual portions conservatively (slightly low). Return ONLY compact valid JSON matching the schema. Keep notes under 80 characters. No quotes or newlines inside strings.",
            },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig,
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
      temperature: 0.15,
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
              text: "Analyze this image for protein. First read any nutrition labels, packaging, or on-screen text for explicit protein grams. If found, protein_source=label and use that value. Otherwise estimate from visual portion — prefer the lower end of plausible weights, never inflate. Return JSON only.",
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

type NormalizedItem = {
  name: string;
  portion: string;
  estimated_grams?: number;
  protein_g: number;
  confidence: string;
};

/** Slight downward bias on visual-only estimates (labels untouched). */
const VISUAL_CONSERVATIVE_TRIM = 0.94;

function calibrateItem(item: NormalizedItem, skipCalibration = false): NormalizedItem {
  if (skipCalibration) return item;

  let protein = item.protein_g;
  const grams = item.estimated_grams;

  if (grams && grams > 0) {
    const density = lookupProteinDensity(item.name);
    if (density) {
      const anchor = proteinFromDensity(grams, density);
      const ratio = anchor > 0 ? protein / anchor : 1;

      if (ratio > 1.15) {
        // LLM overshot vs portion×density — cap near anchor (+3% slack max).
        protein = round1(anchor * 1.03);
      } else if (ratio > 1.05) {
        // Mild overshoot — blend down toward density anchor.
        protein = round1(anchor * 0.65 + protein * 0.35);
      } else if (ratio < 0.7) {
        // Large undershoot — light nudge up only (avoid old aggressive upward bias).
        protein = round1(anchor * 0.15 + protein * 0.85);
      } else {
        protein = round1(protein * VISUAL_CONSERVATIVE_TRIM);
      }
    } else {
      protein = round1(protein * VISUAL_CONSERVATIVE_TRIM);
    }
  } else {
    protein = round1(protein * VISUAL_CONSERVATIVE_TRIM);
  }

  return {
    ...item,
    protein_g: protein,
  };
}

function parseLabelProtein(raw: Record<string, unknown>): number | null {
  const explicit = Number(raw.label_protein_g);
  if (explicit > 0 && explicit <= 200) return round1(explicit);

  const notes = String(raw.notes ?? "").toLowerCase();
  const labelMatch = notes.match(
    /(?:label|nutrition|packaging|per serving|screen|macro)[^.]{0,60}?(\d+(?:\.\d+)?)\s*g(?:\s*protein)?/i,
  ) ?? notes.match(/protein[:\s]+(\d+(?:\.\d+)?)\s*g/i);
  if (labelMatch) {
    const v = round1(Number(labelMatch[1]));
    if (v > 0 && v <= 200) return v;
  }
  return null;
}

function isLabelSource(raw: Record<string, unknown>): boolean {
  const src = String(raw.protein_source ?? "").toLowerCase();
  if (src === "label" || src === "mixed") return true;
  const notes = String(raw.notes ?? "").toLowerCase();
  return /label|nutrition facts|packaging|per serving|screenshot|macro track|on.?screen/i.test(notes);
}

function deriveOverallConfidence(items: NormalizedItem[]): string {
  if (items.length === 0) return "low";
  const ranks = { low: 0, medium: 1, high: 2 };
  const minRank = Math.min(
    ...items.map((i) => ranks[i.confidence as keyof typeof ranks] ?? 1),
  );
  if (minRank === 0) return "low";
  if (minRank === 1) return "medium";
  return "high";
}

function deriveCalories(items: NormalizedItem[], rawCalories: unknown, totalProtein: number): number {
  const fromModel = Math.round(Number(rawCalories) || 0);
  if (fromModel > 0) return fromModel;

  let sum = 0;
  for (const item of items) {
    const grams = item.estimated_grams;
    if (!grams || grams <= 0) continue;
    const kcalPer100g = lookupCalorieDensity(item.name);
    if (kcalPer100g) sum += (grams * kcalPer100g) / 100;
  }
  if (sum > 0) return Math.round(sum);

  if (totalProtein > 0) return Math.round(totalProtein * 5.5);
  return 0;
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

  const labelProtein = parseLabelProtein(raw);
  const fromLabel = isLabelSource(raw) && labelProtein !== null;
  const skipCalibration = fromLabel;

  const items = ((raw.items as Record<string, unknown>[]) ?? [])
    .map((item) => {
      const base: NormalizedItem = {
        name: sanitizeField(item.name, 60) || 'Unknown',
        portion: sanitizeField(item.portion, 80),
        estimated_grams: Math.round(Number(item.estimated_grams) || 0) || undefined,
        protein_g: round1(Number(item.protein_g) || 0),
        confidence: String(item.confidence ?? 'medium'),
      };
      return calibrateItem(base, skipCalibration);
    })
    .filter((item) => item.protein_g >= 0.5);

  let sum = round1(items.reduce((s, i) => s + i.protein_g, 0));
  let total = round1(Number(raw.total_protein_g) || sum);

  // Label path: trust explicit label protein over visual item breakdown.
  if (fromLabel && labelProtein !== null) {
    total = labelProtein;
    if (items.length === 0) {
      items.push({
        name: sanitizeField(raw.food_name, 60) || 'Labeled product',
        portion: 'per label',
        protein_g: labelProtein,
        confidence: 'high',
      });
    } else if (sum < labelProtein * 0.75) {
      // Visual breakdown undershot label — redistribute to label total.
      const ratio = labelProtein / (sum || 1);
      for (const item of items) {
        item.protein_g = round1(item.protein_g * ratio);
      }
      sum = round1(items.reduce((s, i) => s + i.protein_g, 0));
      total = labelProtein;
    }
  } else if (labelProtein !== null && total < labelProtein * 0.75) {
    // Sanity: visible label text beats low visual estimate even if source not set.
    total = labelProtein;
  }

  // Reconcile breakdown vs total (visual path only).
  if (!fromLabel && Math.abs(total - sum) > 1) {
    total = sum;
  }

  // Sanity bounds for a single meal
  if (total > 200) {
    total = 200;
    sum = 200;
  }
  if (total < 0) total = 0;

  let confidence = String(raw.confidence ?? deriveOverallConfidence(items));
  let notes = sanitizeField(raw.notes, 100);

  if (fromLabel) {
    confidence = confidence === 'low' ? 'medium' : 'high';
    if (!notes) notes = 'Protein from visible label or on-screen text';
  }

  if (total >= 150) {
    confidence = confidence === "high" ? "medium" : confidence;
    if (!notes) notes = "Very high protein estimate — double-check portion size";
  }
  if (items.some((i) => i.confidence === "low")) {
    confidence = "low";
    if (!notes) notes = "Portion size unclear — adjust total if needed";
  }

  return {
    is_food: true,
    food_name: sanitizeField(raw.food_name, 80) || 'Meal',
    items,
    total_protein_g: total,
    calories: deriveCalories(items, raw.calories, total),
    confidence,
    notes,
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
