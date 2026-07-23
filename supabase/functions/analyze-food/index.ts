// Protein analysis via server OpenAI gpt-4o (primary) or Gemini fallback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  lookupCalorieDensity,
  caloriesFromDensity,
} from "../_shared/calorie-density.ts";
import {
  lookupProteinDensity,
  proteinFromDensity,
} from "../_shared/protein-density.ts";
import { canScanPhoto } from "../_shared/scan-entitlement.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";
/** auto = cheap/fast tiles; high = more OCR fidelity (≈2–3× image tokens). */
const OPENAI_IMAGE_DETAIL = (() => {
  const raw = (Deno.env.get("OPENAI_IMAGE_DETAIL") ?? "auto").toLowerCase();
  return raw === "high" || raw === "low" || raw === "auto" ? raw : "auto";
})();
const OPENAI_MAX_TOKENS = (() => {
  const raw = Number(Deno.env.get("OPENAI_MAX_TOKENS") ?? "900");
  if (!Number.isFinite(raw) || raw < 400) return 900;
  return Math.min(1600, Math.round(raw));
})();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
/** Gemini fallback chain. Override with GEMINI_MODEL; upgrades: gemini-2.5-pro. */
const GEMINI_MODELS = [
  Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash",
  "gemini-2.5-pro",
];
/** Thinking tokens for 2.5 models. Lower = cheaper/faster fallback (OpenAI is primary). */
const GEMINI_THINKING_BUDGET = (() => {
  const raw = Number(Deno.env.get("GEMINI_THINKING_BUDGET") ?? "128");
  if (!Number.isFinite(raw) || raw < 0) return 128;
  return Math.min(1024, Math.round(raw));
})();

/** Skip OpenAI for a while after hard account failures (billing/quota) so scans stay fast. */
const OPENAI_CIRCUIT_MS = 10 * 60 * 1000;
let openaiCircuitOpenUntil = 0;
let openaiCircuitReason = "";

function isHardOpenAIFailure(message: string): boolean {
  return /billing_not_active|billing|insufficient_quota|exceeded.?your.?current.?quota|account.?deactivated|invalid.?api.?key|incorrect.?api.?key/i
    .test(message);
}

function openaiCircuitOpen(): boolean {
  return Date.now() < openaiCircuitOpenUntil;
}

function tripOpenAICircuit(reason: string): void {
  openaiCircuitOpenUntil = Date.now() + OPENAI_CIRCUIT_MS;
  openaiCircuitReason = reason.slice(0, 240);
  console.warn(
    `OpenAI circuit open for ${OPENAI_CIRCUIT_MS / 1000}s:`,
    openaiCircuitReason,
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-requested-with",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN and CALORIES from food photos.
Be precise and realistic. Prefer mid-range portions. Do NOT systematically undercount calories OR inflate protein grams.
Models often underestimate grams on crowded plates — correct for that bias.

WORK IN 6 STEPS (reason internally, output final JSON only):
0. LABEL / TEXT DETECTION (FIRST — highest priority):
   - Read nutrition facts, packaging, barcodes, macro-app screenshots, menus with macros.
   - OCR numbers near Protein/PRO/P: and Calories/Energy/kcal/Cal.
   - Distinguish per serving vs per container vs per 100g. Match the amount shown.
   - If explicit protein grams are clear → protein_source="label", label_protein_g=that value, total_protein_g=that value. Do NOT override with visual math.
   - If explicit calories are clear → label_calories_g and calories use that value. Label wins.
   - When no label: label_protein_g=null, label_calories_g=null, protein_source="visual".
1. IDENTIFY every visible edible component (skip if step 0 is authoritative). Name specific dishes when clear (sambar rice, paneer tikka, biryani). Note cooking method. Infer cooking fat when greens look glossy/sautéed or meat looks oil-brushed.
2. SIZE THE PLATE FIRST (critical for accuracy):
   - Infer reference objects: dinner plate ~26cm, bowl diameter, fork ~19cm, palm ~10cm, takeout box.
   - Estimate each component's area/height, then convert to cooked edible grams BEFORE macros.
3. ESTIMATE PORTION (visual/mixed only) with anchors:
   - Typical chicken breast meal: 140–200g cooked. Use 200–250g ONLY when the plate is clearly piled with thick strips/breast covering most of the plate.
   - Strip chicken: count strips × 25–35g (thick/wide). Thin strips ≈20–25g. Do not invent hidden chicken under greens.
   - Egg ~50g (~6g protein); deck-of-cards meat ~85g; fist rice/pasta ~150–180g cooked; half-plate rice ~120–150g
   - Sambar/dal ladle ~150–220g; roti/chapati ~40–50g each; idli ~40g each; dosa ~80–120g
   - Paneer cube pile: count cubes × 15–20g; typical tikka serving 100–140g
   - Greens bed under protein: 80–120g typical (share plate space — do not full-plate each item)
   - Oil: add "~1 tbsp olive oil/ghee" (~14g, ~120 kcal) when sautéed/glossy/fried/curry sheen; skip if dry/steamed
   - Protein bar ~60g; yogurt cup 125–170g
4. protein_g = estimated_grams × (protein/100g) / 100. Densities: chicken breast 31, paneer 18, ground beef 26, salmon 25, egg 13, greek yogurt 10, tofu 17, dal/lentils 9, sambar 3.5, kale/spinach 3, rice 2.7, roti 8, cheese 25, protein bar 30, oil/butter/ghee 0
5. calories_g = estimated_grams × (kcal/100g) / 100. Densities: chicken breast 165, paneer 265, ground beef 250, salmon 208, egg 155, greek yogurt 97, tofu 76, dal 116, sambar 55, rice 130, roti 297, pasta 131, cheese 350, protein bar 400, bread 265, olive oil/butter/ghee 717
6. SUM item protein → total_protein_g (±0.5g). SUM calories_g → calories (±15 kcal). Round grams to nearest 5g. Re-check totals vs item sum.

Rules:
- protein_source: label | visual | mixed (label wins totals when mixed)
- Never double-count oil already baked into fried/breaded item calories
- Skip zero-calorie garnishes (lemon, herbs, pickles)
- estimated_grams = cooked edible weight only. Typical plate total food 300–550g incl. oil
- confidence: low (ambiguous), medium (reasonable), high (clear size + familiar food)
- Never hallucinate invisible food. Notes ≤100 chars. No quotes/backslashes/newlines in strings.

Few-shots (adapt; do not copy blindly):
A) Full-plate grilled chicken strips ~210g + sautéed greens ~100g + parmesan ~8g + oil ~14g → protein ≈65+3+2=70g; kcal ≈350+35+28+100≈510
B) 2 scrambled eggs + toast + butter → protein ~16g; kcal ~270
C) Chicken curry: chicken ~120g (37g) + sauce/veg ~200g (6g) → protein ~43g; kcal ~450–550
D) Non-food / empty plate → is_food=false
E) Label "Protein 50g" → protein_source=label, label_protein_g=50, total=50
F) Scoop label "24g protein" → total=24
G) Macro screenshot "Protein: 48g" → total=48
H) Label "Calories 320" → label_calories_g=320, calories=320
I) Smaller strip plate (~7 thin strips ~150g) + dry steamed greens (~80g), no oil → protein ~48g; kcal ~275
J) Sambar rice: rice ~180g + sambar ~200g → protein ~13g; kcal ~340
K) Paneer tikka ~120g + oil ~10g → protein ~22g; kcal ~340`;

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
    // strict json_schema requires every property in `required`; use null when no label.
    label_protein_g: { type: ["number", "null"] },
    label_calories_g: { type: ["number", "null"] },
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
    "label_protein_g",
    "label_calories_g",
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
    const gate = await enforcePhotoScanLimit(req);
    if (gate) return gate;

    const body = await req.json();
    const { image_base64, mime_type = "image/jpeg", user_note } = body;
    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }
    const userNote = sanitizeField(user_note, 280);

    if (OPENAI_API_KEY && !openaiCircuitOpen()) {
      try {
        const raw = await callOpenAI(image_base64, mime_type, userNote);
        return json({
          analysis: normalize(raw, userNote),
          model: OPENAI_MODEL,
          provider: "openai",
        });
      } catch (openaiErr) {
        const openaiMessage =
          openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
        console.error("OpenAI primary failed:", openaiMessage);
        if (isHardOpenAIFailure(openaiMessage)) {
          tripOpenAICircuit(openaiMessage);
        }
        if (GEMINI_API_KEY) {
          console.warn("Falling back to Gemini after OpenAI failure");
          const { raw, model } = await callGeminiWithRetry(
            GEMINI_API_KEY,
            image_base64,
            mime_type,
            userNote,
          );
          return json({
            analysis: normalize(raw, userNote),
            model,
            provider: "gemini",
            fallback_from: "openai",
            fallback_model: OPENAI_MODEL,
            fallback_reason: openaiMessage.slice(0, 240),
          });
        }
        throw openaiErr;
      }
    }

    if (OPENAI_API_KEY && openaiCircuitOpen() && GEMINI_API_KEY) {
      const { raw, model } = await callGeminiWithRetry(
        GEMINI_API_KEY,
        image_base64,
        mime_type,
        userNote,
      );
      return json({
        analysis: normalize(raw, userNote),
        model,
        provider: "gemini",
        fallback_from: "openai",
        fallback_model: OPENAI_MODEL,
        fallback_reason: `circuit_open: ${openaiCircuitReason}`.slice(0, 240),
      });
    }

    if (!GEMINI_API_KEY) {
      return json({ error: "AI service is not configured. Please try again later." }, 503);
    }

    const { raw, model } = await callGeminiWithRetry(
      GEMINI_API_KEY,
      image_base64,
      mime_type,
      userNote,
    );
    return json({ analysis: normalize(raw, userNote), model, provider: "gemini" });
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

function isDeadGeminiModel(message: string): boolean {
  return /no longer available|not found|is not supported|INVALID_ARGUMENT.*model/i.test(
    message,
  );
}

function supportsThinking(model: string): boolean {
  return /gemini-2\.5-(flash|flash-lite|pro)/i.test(model);
}

function userNotePromptSuffix(userNote: string): string {
  if (!userNote) return "";
  return `

USER NOTE (first-class evidence with the photo — fuse both; do not treat as a caption-only hint):
"${userNote}"

Fusion rules:
1. IDENTITY: Prefer the user's dish name / ingredients when they clarify the plate (e.g. "sambar rice", "chicken tikka, no naan", "greek yogurt + honey"). Confirm those foods in the photo; reject inventing foods the image clearly does not show.
2. PORTIONS: If the note states amounts or size ("half plate", "2 eggs", "large bowl", "small serving", "200g"), set estimated_grams and portion text to match. If the note only names foods, use visual portion anchors from the photo.
3. food_name: Prefer a short name that matches the user's wording when it fits the plate (e.g. "Sambar rice" not a generic "Rice bowl").
4. MACROS: Recalculate protein_g / calories_g from the fused identity + portions. Cooking fat, oil, sauce, and plate size still come from the image.
5. CONFLICTS: Photo wins on what is present; explicit user amounts win on portion size when stated.`;
}

async function callGeminiWithRetry(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  userNote = "",
): Promise<{ raw: Record<string, unknown>; model: string }> {
  let lastErr: Error | null = null;

  const models = [...new Set(GEMINI_MODELS.filter(Boolean))];
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callGemini(apiKey, imageBase64, mimeType, model, attempt, userNote);
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
        if (isDeadGeminiModel(lastErr.message)) break;
        if (!retryable || isLastAttempt) break;
        await sleep(200 * (attempt + 1));
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
  userNote = "",
): Promise<Record<string, unknown>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0,
    maxOutputTokens: 1024,
    responseMimeType: "application/json",
    responseSchema: GEMINI_SCHEMA,
  };

  // Low thinking budget: improves portion/oil reasoning vs 0, still much faster/cheaper than 768.
  // USDA density calibration still anchors macros after the model responds.
  if (supportsThinking(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
  }

  const basePrompt =
    attempt === 0
      ? "Analyze this image for protein and calories. Step 0: read any nutrition labels, packaging text, or on-screen macros (OCR). If label shows protein or calories, use those as primary source (protein_source=label). Otherwise Step 1-5: identify foods, estimate grams, apply protein and calorie density, sum. Return valid JSON only."
      : "Analyze this image for protein and calories. Check labels/text first. Return ONLY compact valid JSON matching the schema. Keep notes under 80 characters. No quotes or newlines inside strings.";

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [
            {
              text: basePrompt + userNotePromptSuffix(userNote),
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
  userNote = "",
): Promise<Record<string, unknown>> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callOpenAIOnce(imageBase64, mimeType, userNote);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const retryable = /rate.?limit|timeout|temporar|overloaded|server.?error|5\d\d/i.test(
        lastErr.message,
      );
      if (!retryable || attempt === 1) break;
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error("AI analysis failed. Please try again.");
}

async function callOpenAIOnce(
  imageBase64: string,
  mimeType: string,
  userNote = "",
): Promise<Record<string, unknown>> {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: OPENAI_MAX_TOKENS,
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
              text:
                "Analyze protein + calories. Prefer labels/OCR when present (set label_* fields). Else: size the plate first, estimate cooked grams per component, then apply density math. Fuse any user note for identity + portions. Return JSON only." +
                userNotePromptSuffix(userNote),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: OPENAI_IMAGE_DETAIL,
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
        message = "billing_not_active: enable OpenAI billing for gpt-4o primary";
      } else if (parsed?.error?.code === "insufficient_quota") {
        message = "insufficient_quota: OpenAI quota exceeded";
      } else if (parsed?.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      /* default */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = openaiRes.status;
    throw err;
  }

  const completion = await openaiRes.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI returned an empty response. Please try again.");
  }
  return JSON.parse(content);
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
    // USDA/density table is the source of truth for known foods (cheapest accuracy win).
    const fromDensity = proteinFromDensity(grams, proteinDensity);
    const llmProtein = next.protein_g > 0 ? next.protein_g : fromDensity;
    const gap = fromDensity > 0 ? Math.abs(llmProtein - fromDensity) / fromDensity : 0;
    const blended = round1(fromDensity * 0.82 + llmProtein * 0.18);
    next = {
      ...next,
      protein_g: blended,
      confidence: gap > 0.4 ? "medium" : next.confidence,
    };
  }

  return calibrateItemCalories(next, skipCalibration);
}

function snapGrams(grams: number): number {
  if (grams <= 0) return 0;
  return Math.max(5, Math.round(grams / 5) * 5);
}

/**
 * Real prepared/restaurant portions carry absorbed cooking fat, oil, sauce, glaze and
 * marinade that bare USDA "cooked" densities exclude, so lean anchors run ~8% low vs how
 * references (e.g. ChatGPT) score the same plate. Lift whole-food anchors to prepared level.
 * Pure fats (oil/butter) are already accurate at 717 kcal/100g, so they are excluded.
 */
const CALORIE_REALISM_FACTOR = 1.08;

function isPureFatItem(name: string): boolean {
  return /\b(oil|butter|ghee|lard|dressing|mayo)\b/i.test(name);
}

/** Anchor calories to USDA densities — correct both over- and under-estimates. */
function calibrateItemCalories(item: NormalizedItem, skipCalibration = false): NormalizedItem {
  if (skipCalibration) return item;

  const grams = item.estimated_grams;
  if (!grams || grams <= 0) return item;

  const calorieDensity = lookupCalorieDensity(item.name);
  if (!calorieDensity) return item;

  const rawAnchor = caloriesFromDensity(grams, calorieDensity);
  const anchor = isPureFatItem(item.name)
    ? rawAnchor
    : Math.round(rawAnchor * CALORIE_REALISM_FACTOR);
  const llmCalories = item.calories_g > 0 ? item.calories_g : anchor;

  // LLM far above density (likely hallucinated oil already counted) → blend toward anchor.
  if (llmCalories > anchor * 1.35) {
    const excess = anchor > 0 ? (llmCalories - anchor) / llmCalories : 0;
    const anchorWeight = Math.min(0.65, 0.35 + excess * 0.4);
    const blended = Math.round(anchor * anchorWeight + llmCalories * (1 - anchorWeight));
    return {
      ...item,
      calories_g: Math.max(anchor, Math.min(blended, Math.round(anchor * 1.25))),
      confidence: excess > 0.35 ? "medium" : item.confidence,
    };
  }

  // LLM under density → pull up to the realistic anchor (common failure mode).
  if (llmCalories < anchor * 0.85) {
    const shortfall = anchor > 0 ? (anchor - llmCalories) / anchor : 0;
    const densityWeight = shortfall > 0.4 ? 0.7 : 0.5;
    const blended = Math.round(anchor * densityWeight + llmCalories * (1 - densityWeight));
    return {
      ...item,
      calories_g: Math.max(blended, llmCalories, anchor),
      confidence: shortfall > 0.5 ? "medium" : item.confidence,
    };
  }

  // Near anchor — ground hard to USDA/prepared density (keeps cost low vs a second model call).
  const blended = Math.round(anchor * 0.78 + llmCalories * 0.22);
  return { ...item, calories_g: Math.max(Math.round(anchor * 0.9), blended) };
}

/** Apply explicit user portion cues (counts, half plate, grams) before density grounding. */
function applyUserNotePortionHints(
  items: NormalizedItem[],
  userNote: string,
): NormalizedItem[] {
  if (!userNote.trim() || items.length === 0) return items;
  const note = userNote.toLowerCase();
  let next = items.map((i) => ({ ...i }));

  const eggMatch = note.match(/(\d+)\s*eggs?\b/);
  if (eggMatch) {
    const n = Math.min(12, Math.max(1, Number(eggMatch[1])));
    for (const item of next) {
      if (/\begg/i.test(item.name)) item.estimated_grams = snapGrams(n * 50);
    }
  }

  const rotiMatch = note.match(/(\d+)\s*(rotis?|chapatis?|chapathis?|naans?|parathas?)\b/);
  if (rotiMatch) {
    const n = Math.min(8, Math.max(1, Number(rotiMatch[1])));
    for (const item of next) {
      if (/roti|chapati|chapathi|naan|paratha/i.test(item.name)) {
        item.estimated_grams = snapGrams(n * 45);
      }
    }
  }

  // "200g rice" / "rice 200g"
  const gramPairs: Array<{ grams: number; food: string }> = [];
  for (const m of note.matchAll(/(\d{2,4})\s*g(?:rams?)?\s+(?:of\s+)?([a-z][a-z\s]{1,28})/g)) {
    gramPairs.push({ grams: Number(m[1]), food: m[2].trim() });
  }
  for (const m of note.matchAll(/([a-z][a-z\s]{1,28}?)\s+(\d{2,4})\s*g(?:rams?)?\b/g)) {
    gramPairs.push({ grams: Number(m[2]), food: m[1].trim() });
  }
  for (const hint of gramPairs) {
    if (!hint.grams || hint.grams < 20 || hint.grams > 900) continue;
    const key = hint.food.split(/\s+/).slice(0, 3).join(" ");
    for (const item of next) {
      if (item.name.toLowerCase().includes(key) || key.includes(item.name.toLowerCase().split(/\s+/)[0])) {
        item.estimated_grams = snapGrams(hint.grams);
      }
    }
  }

  let scale = 1;
  if (/\b(half|1\/2)\s*(plate|portion|serving|bowl)\b/.test(note)) scale = 0.55;
  else if (/\b(small|light)\s*(plate|portion|serving|bowl)?\b/.test(note)) scale = 0.75;
  else if (/\b(large|big|huge|full)\s*(plate|portion|serving|bowl)\b/.test(note)) scale = 1.25;
  else if (/\bdouble\b/.test(note)) scale = 1.5;

  if (scale !== 1) {
    next = next.map((item) => {
      if (!item.estimated_grams || isPureFatItem(item.name)) return item;
      return { ...item, estimated_grams: snapGrams(item.estimated_grams * scale) };
    });
  }

  return next;
}

const OILY_PREP_PATTERN =
  /fried|deep.?fried|saut[eé]|pan.?fried|crispy|butter|oil|olive|curry|cream|cheese sauce|mayo|dressing|gravy|battered|breaded|roasted in|glossy/i;

function hasCookingFatItem(items: NormalizedItem[]): boolean {
  return items.some((i) => /\b(oil|butter|ghee|lard|dressing|mayo)\b/i.test(i.name));
}

/** Add ~1 tbsp oil when prep implies fat but model omitted it. */
function ensureCookingFatCalories(items: NormalizedItem[]): NormalizedItem[] {
  if (items.length === 0 || hasCookingFatItem(items)) return items;
  const oily = items.some((i) => OILY_PREP_PATTERN.test(`${i.portion} ${i.name}`));
  if (!oily) return items;
  return [
    ...items,
    {
      name: "olive oil (cooking)",
      portion: "~1 tbsp cooking fat (implied)",
      estimated_grams: 14,
      protein_g: 0,
      calories_g: 120,
      confidence: "medium",
    },
  ];
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

function normalize(raw: Record<string, unknown>, userNote = "") {
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

  const baseItems = ((raw.items as Record<string, unknown>[]) ?? []).map((item) => {
    const rawGrams = Math.round(Number(item.estimated_grams) || 0);
    const grams = rawGrams > 0 ? snapGrams(rawGrams) : undefined;
    const calorieDensity = grams ? lookupCalorieDensity(String(item.name ?? "")) : null;
    const llmCalories = Math.round(Number(item.calories_g) || 0);
    const fallbackCalories =
      grams && calorieDensity ? caloriesFromDensity(grams, calorieDensity) : llmCalories;

    return {
      name: sanitizeField(item.name, 60) || "Unknown",
      portion: sanitizeField(item.portion, 80),
      estimated_grams: grams,
      protein_g: round1(Number(item.protein_g) || 0),
      calories_g: llmCalories > 0 ? llmCalories : fallbackCalories,
      confidence: String(item.confidence ?? "medium"),
    } satisfies NormalizedItem;
  });

  const hinted = applyUserNotePortionHints(baseItems, userNote);
  const items = ensureCookingFatCalories(
    hinted
      .map((item) => calibrateItem(item, skipCalibration))
      // Keep calorie-dense items (oil/butter) even with ~0 protein.
      .filter((item) => item.protein_g >= 0.5 || item.calories_g >= 40),
  );

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

  if (calories > 3500) calories = 3500;
  if (calories < 0) calories = 0;

  // Never return blank/zero macros for a recognized meal — UI must show numbers.
  if (total <= 0 && items.length > 0) {
    total = round1(items.reduce((s, i) => s + i.protein_g, 0));
  }
  if (calories <= 0) {
    const densityFallback = Math.round(
      items.reduce((s, i) => {
        const grams = i.estimated_grams ?? 0;
        const dens = grams > 0 ? lookupCalorieDensity(i.name) : null;
        return dens ? s + caloriesFromDensity(grams, dens) : s;
      }, 0),
    );
    if (densityFallback > 0) {
      calories = densityFallback;
    } else if (total > 0) {
      // Last resort: ~4 kcal/g protein + modest carb/fat buffer for a plate.
      calories = Math.max(Math.round(total * 8), 50);
    } else {
      calories = 150;
    }
  }
  if (total <= 0) total = 1;

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

async function enforcePhotoScanLimit(req: Request): Promise<Response | null> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return json({ error: "Sign in required to scan meals." }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return json({ error: "Sign in required to scan meals." }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await admin
    .from("profiles")
    .select("is_premium, created_at")
    .eq("id", userId)
    .maybeSingle();

  const { count: lifetimeMeals } = await admin
    .from("protein_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("source", ["photo", "manual"]);

  // Count only photo_scan rows — each AI analysis records one. Do NOT also
  // count logged `photo` meals or free users effectively get ~2 scans (scan+log
  // would burn two slots toward FREE_DAILY_SCANS).
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin
    .from("protein_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("logged_date", today)
    .eq("source", "photo_scan");

  const decision = canScanPhoto({
    isPremium: profile?.is_premium === true,
    createdAt: profile?.created_at ?? null,
    scansUsedToday: count ?? 0,
    lifetimeMeals: lifetimeMeals ?? 0,
  });

  if (!decision.allowed) {
    return json({ error: decision.message ?? "Daily scan limit reached." }, 403);
  }

  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
