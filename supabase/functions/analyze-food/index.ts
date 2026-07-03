// Protein analysis via server Gemini key (primary) or OpenAI fallback.

import {
  lookupCalorieDensity,
  caloriesFromDensity,
} from "../_shared/calorie-density.ts";
import {
  lookupProteinDensity,
  proteinFromDensity,
} from "../_shared/protein-density.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

/** Final downward nudge on visual scans after USDA anchor calibration. */
const VISUAL_CALORIE_BIAS = 0.88;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN and CALORIES from food photos.

WORK IN 5 STEPS (reason internally, output final JSON only):
0. LABEL / TEXT DETECTION (do this FIRST — highest priority):
   - Scan the image for ANY readable text: nutrition facts panels, supplement labels, packaging, barcodes, macro-tracking app screenshots, restaurant menus with macros.
   - OCR-style: read every number near "Protein", "PRO", "P:", "prot", or inside a protein row on a nutrition label.
   - Also read "Calories", "Energy", "kcal", "Cal" on labels or macro app screenshots. Set label_calories_g when visible (per serving unless container math is obvious).
   - Distinguish "per serving" vs "per container" vs "per 100g". If the whole package/product shown matches one serving, use per-serving values. If multiple servings visible, multiply accordingly.
   - If explicit protein grams are visible with high confidence → set protein_source="label", label_protein_g to that value, and USE IT as total_protein_g. Do NOT replace label values with visual portion math.
   - If explicit calories/kcal are visible with high confidence → use label_calories_g as calories total. Label wins over visual estimation.
   - Label wins over visual estimation. A nutrition label showing "Protein 50g" means total_protein_g≈50 even if the food photo alone looks smaller.
   - Set items to reflect the labeled product (e.g. one item "Protein powder (label)" with protein_g matching label). estimated_grams optional when source is label.
1. IDENTIFY every visible food component (skip if step 0 found authoritative label text). Separate visible items from likely hidden ingredients (sauce, oil, cheese dust, marinade). Note cooking method (grilled, fried, baked) — affects weight more than protein density.
2. ESTIMATE PORTION SIZE for each item using visual anchors (only when protein_source is "visual" or "mixed"):
   - Standard dinner plate ~26cm; fork ~19cm; palm ~10cm wide
   - Palm-sized chicken breast (cooked) ~120g; large breast ~160-180g
   - Sliced/strip chicken: count strips × ~18-22g each (7 strips ≈130-150g, NOT full plate weight)
   - 1 large egg ~50g (~6g protein); 2 eggs ~100g (~13g protein)
   - Deck-of-cards meat portion ~85g; fist-sized rice/pasta ~150g cooked
   - Greens/kale bed under protein: ~60-100g (shares plate with protein above)
   - Protein bar ~60g; yogurt cup small ~125g, large ~170g
3. CALCULATE protein_g = estimated_grams × (protein per 100g for that food) / 100
   Densities: chicken breast 31, ground beef 26, salmon 25, egg 13, greek yogurt 10, tofu 17, kale/spinach 3, rice 2.7, cheese 25, protein bar 30
4. CALCULATE calories_g per item = estimated_grams × (kcal per 100g for that food) / 100
   Energy densities (cooked, lean/grilled defaults): chicken breast 165, ground beef 250, salmon 208, egg 155, greek yogurt 97, tofu 76, kale/spinach 35, rice 130, pasta 131, cheese 350, protein bar 400, bread 265
   Default to grilled/steamed/baked — not deep-fried. Only add extra kcal if oil/butter/frying is clearly visible. Do NOT guess hidden butter or restaurant oil.
   When portion size is ambiguous, use the LOWER end of the weight range. Bias conservative on calories.
   Calories MUST equal estimated_grams × density / 100 per item — do not guess extra oil, butter, or restaurant fat unless clearly visible.
5. SUM all item protein_g → total_protein_g (must match within 0.5g). SUM all item calories_g → calories (must match within 15 kcal). Round estimated_grams to nearest 5g.

Rules:
- protein_source: "label" when nutrition label/packaging/on-screen text provides protein grams; "visual" when estimating from food appearance only; "mixed" when both exist (label wins for total).
- label_protein_g: set when step 0 finds explicit protein on a label or screen; null/omit otherwise.
- label_calories_g: set when step 0 finds explicit Calories/Energy/kcal on a label or screen; null/omit otherwise.
- Each item must include calories_g (integer kcal for that component).
- If NOT food: is_food=false, empty food_name, empty items, zeros, protein_source="visual", explain in notes.
- If food: list protein-bearing components only (chicken, eggs, meat, fish, tofu, beans, cheese, yogurt). Skip zero-protein garnishes (lemon wedge, herbs, pickles).
- LAYERED PLATES: items share plate space — do NOT assign full plate area to each item. Greens under chicken are typically 60-120g, not equal to the protein portion.
- portion must describe size AND method ("~150g grilled, 6 strips", "~80g sautéed bed under chicken").
- estimated_grams = cooked edible weight only. Typical dinner plate total food ~250-450g.
- Per-item confidence: low (ambiguous size), medium (reasonable estimate), high (clear size + familiar food).
- Never hallucinate food not visible. Hidden ingredients only if strongly implied (curry sauce, burger patty under bun).
- Keep notes under 100 characters. No double quotes, backslashes, or line breaks inside strings.

Few-shot calibration examples (do NOT copy blindly — adapt to the photo):
A) Grilled chicken strips (7 strips ~140g) + sautéed kale (~80g) + parmesan dust (~5g):
   chicken 140g×31%=43.4g, kale 80g×3%=2.4g, cheese 5g×25%=1.3g → total ~47g, confidence medium-high
B) 2 scrambled eggs (~100g) + toast (~30g):
   eggs 13g, toast 2.7g → total ~16g
C) Chicken curry bowl: visible chicken ~120g (37g) + sauce/veg ~200g (6g) → total ~43g
D) Empty plate or non-food → is_food=false
E) Nutrition label photo showing "Protein 50g" per serving, whole product visible:
   protein_source="label", label_protein_g=50, one item from label → total_protein_g=50, confidence high
F) Supplement tub label "24g protein per scoop" with one scoop shown → label_protein_g=24, total 24g
G) Macro app screenshot showing "Protein: 48g" for logged meal → label_protein_g=48, trust screen text
H) Nutrition label "Calories 320" per serving → label_calories_g=320, calories=320
I) Grilled chicken strips (7 strips ~140g) + kale (~80g): protein ~47g, calories ~140×1.65 + 80×0.35 ≈ 260 kcal (do not add oil unless visible)`;

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
          calories_g: { type: "number" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "estimated_grams", "protein_g", "calories_g", "confidence"],
      },
    },
    total_protein_g: { type: "number" },
    calories: { type: "number" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string" },
    label_protein_g: { type: "number" },
    label_calories_g: { type: "number" },
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
          calories_g: { type: "NUMBER" },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
        },
        required: ["name", "portion", "estimated_grams", "protein_g", "calories_g", "confidence"],
      },
    },
    total_protein_g: { type: "NUMBER" },
    calories: { type: "NUMBER" },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    notes: { type: "STRING" },
    label_protein_g: { type: "NUMBER" },
    label_calories_g: { type: "NUMBER" },
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
    temperature: 0,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    responseSchema: GEMINI_SCHEMA,
  };

  if (attempt === 0 && supportsThinking(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 768 };
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
                  ? "Analyze this image for protein and calories. Step 0: read any nutrition labels, packaging text, or on-screen macros (OCR). If label shows protein or calories, use those as primary source (protein_source=label). Otherwise Step 1-5: identify foods, estimate grams, apply protein and calorie density, sum. Return valid JSON only."
                  : "Analyze this image for protein and calories. Check labels/text first. Return ONLY compact valid JSON matching the schema. Keep notes under 80 characters. No quotes or newlines inside strings.",
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
      temperature: 0,
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
              text: "Analyze this image for protein and calories. First read any nutrition labels, packaging, or on-screen text for explicit protein grams and Calories/kcal. If found, protein_source=label and use those values. Otherwise estimate from visual portion. Return JSON only.",
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
  calories_g: number;
  confidence: string;
};

function calibrateItem(item: NormalizedItem, skipCalibration = false): NormalizedItem {
  if (skipCalibration) return item;

  const grams = item.estimated_grams;
  if (!grams || grams <= 0) return item;

  const proteinDensity = lookupProteinDensity(item.name);
  let next = { ...item };

  if (proteinDensity) {
    const fromDensity = proteinFromDensity(grams, proteinDensity);
    const llmProtein = next.protein_g;

    if (llmProtein < fromDensity * 0.85) {
      const shortfall = fromDensity > 0 ? (fromDensity - llmProtein) / fromDensity : 0;
      const densityWeight = shortfall > 0.4 ? 0.6 : 0.4;
      const blended = round1(fromDensity * densityWeight + llmProtein * (1 - densityWeight));
      next = {
        ...next,
        protein_g: Math.max(blended, llmProtein),
        confidence: shortfall > 0.5 ? "medium" : next.confidence,
      };
    }
  }

  return calibrateItemCalories(next, skipCalibration);
}

function snapGrams(grams: number): number {
  if (grams <= 0) return 0;
  return Math.max(5, Math.round(grams / 5) * 5);
}

/** Anchor calories to USDA densities; pull down LLM overestimates, never inflate above model. */
function calibrateItemCalories(item: NormalizedItem, skipCalibration = false): NormalizedItem {
  if (skipCalibration) return item;

  const grams = item.estimated_grams;
  if (!grams || grams <= 0) return item;

  const calorieDensity = lookupCalorieDensity(item.name);
  if (!calorieDensity) return item;

  const anchor = caloriesFromDensity(grams, calorieDensity);
  const llmCalories = item.calories_g > 0 ? item.calories_g : anchor;

  if (llmCalories > anchor * 1.02) {
    const excess = anchor > 0 ? (llmCalories - anchor) / llmCalories : 0;
    const anchorWeight = Math.min(0.8, 0.45 + excess * 0.5);
    const blended = Math.round(anchor * anchorWeight + llmCalories * (1 - anchorWeight));
    return {
      ...item,
      calories_g: Math.min(blended, llmCalories, Math.round(anchor * 1.05)),
      confidence: excess > 0.25 ? "medium" : item.confidence,
    };
  }

  if (llmCalories < anchor * 0.55) {
    return {
      ...item,
      calories_g: Math.round(anchor * 0.92),
      confidence: item.confidence === "high" ? "medium" : item.confidence,
    };
  }

  return { ...item, calories_g: Math.round(anchor * 0.55 + llmCalories * 0.45) };
}

function parseLabelCalories(raw: Record<string, unknown>): number | null {
  const explicit = Number(raw.label_calories_g);
  if (explicit > 0 && explicit <= 5000) return Math.round(explicit);

  const notes = String(raw.notes ?? "").toLowerCase();
  const labelMatch = notes.match(
    /(?:calories|energy|kcal|cal)[:\s]+(\d+(?:\.\d+)?)/i,
  ) ?? notes.match(/(\d+(?:\.\d+)?)\s*(?:kcal|calories)/i);
  if (labelMatch) {
    const v = Math.round(Number(labelMatch[1]));
    if (v > 0 && v <= 5000) return v;
  }
  return null;
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
  const labelCalories = parseLabelCalories(raw);
  const fromLabel = isLabelSource(raw) && (labelProtein !== null || labelCalories !== null);
  const skipCalibration = fromLabel;

  const items = ((raw.items as Record<string, unknown>[]) ?? [])
    .map((item) => {
      const rawGrams = Math.round(Number(item.estimated_grams) || 0);
      const grams = rawGrams > 0 ? snapGrams(rawGrams) : undefined;
      const calorieDensity = grams ? lookupCalorieDensity(String(item.name ?? '')) : null;
      const llmCalories = Math.round(Number(item.calories_g) || 0);
      const fallbackCalories =
        grams && calorieDensity ? caloriesFromDensity(grams, calorieDensity) : llmCalories;

      const base: NormalizedItem = {
        name: sanitizeField(item.name, 60) || 'Unknown',
        portion: sanitizeField(item.portion, 80),
        estimated_grams: grams,
        protein_g: round1(Number(item.protein_g) || 0),
        calories_g: llmCalories > 0 ? llmCalories : fallbackCalories,
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
    if (!notes) notes = "Very high protein estimate. Double-check portion size";
  }
  if (items.some((i) => i.confidence === "low")) {
    confidence = "low";
    if (!notes) notes = "Portion size unclear. Adjust total if needed";
  }

  let caloriesSum = items.reduce((s, i) => s + i.calories_g, 0);
  let calories = Math.round(Number(raw.calories) || caloriesSum || 0);

  if (fromLabel && labelCalories !== null) {
    calories = labelCalories;
    if (caloriesSum > 0 && caloriesSum < labelCalories * 0.75) {
      const ratio = labelCalories / caloriesSum;
      for (const item of items) {
        item.calories_g = Math.round(item.calories_g * ratio);
      }
      caloriesSum = items.reduce((s, i) => s + i.calories_g, 0);
    }
  } else if (labelCalories !== null && calories < labelCalories * 0.75) {
    calories = labelCalories;
  } else if (caloriesSum > 0) {
    // Density-calibrated item sum wins over volatile model total.
    calories = caloriesSum;
  }

  if (!fromLabel && calories > 0) {
    calories = Math.round(calories * VISUAL_CALORIE_BIAS);
  }

  if (calories > 3500) calories = 3500;
  if (calories < 0) calories = 0;

  return {
    is_food: true,
    food_name: sanitizeField(raw.food_name, 80) || 'Meal',
    items: items.map(({ calories_g: _c, ...item }) => item),
    total_protein_g: total,
    calories,
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
