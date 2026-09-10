// Protein analysis via server OpenAI gpt-4o (primary) or Gemini fallback.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  lookupCalorieDensity,
  caloriesFromDensity,
} from "../_shared/calorie-density.ts";
import {
  CUISINE_FEW_SHOTS,
  CUISINE_IDENTIFY_RULES,
  GEMINI_USER_ANALYZE_RETRY_TEXT,
  GEMINI_USER_ANALYZE_TEXT,
  OPENAI_USER_ANALYZE_TEXT,
} from "../_shared/cuisine-prompt.ts";
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
  const raw = Number(Deno.env.get("OPENAI_MAX_TOKENS") ?? "700");
  if (!Number.isFinite(raw) || raw < 400) return 700;
  return Math.min(1400, Math.round(raw));
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
Be precise and realistic. Prefer realistic home-cooked portions. Do NOT default to half-plate when starch clearly fills most of the dinner plate. Do NOT systematically undercount calories OR inflate protein grams.
Models often underestimate grams on crowded plates and rice mounds - correct for that bias.
You are also a strong multi-cuisine dish identifier. Prefer exact cultural dish names over generic labels (curry, stir fry, rice bowl).

WORK IN 6 STEPS (reason internally, output final JSON only):
0. LABEL / TEXT DETECTION (FIRST - highest priority):
   - Read nutrition facts, packaging, barcodes, macro-app screenshots, menus with macros.
   - OCR numbers near Protein/PRO/P: and Calories/Energy/kcal/Cal.
   - Distinguish per serving vs per container vs per 100g. Match the amount shown.
   - If explicit protein grams are clear → protein_source="label", label_protein_g=that value, total_protein_g=that value. Do NOT override with visual math.
   - If explicit calories are clear → label_calories_g and calories use that value. Label wins.
   - When no label: label_protein_g=null, label_calories_g=null, protein_source="visual".
1. IDENTIFY every visible edible component (skip if step 0 is authoritative):
${CUISINE_IDENTIFY_RULES}
   - Note cooking method. Infer cooking fat when greens look glossy/sautéed or meat/seafood looks oil-brushed.
2. SIZE THE PLATE FIRST (critical for accuracy):
   - Infer reference objects: dinner plate ~26cm, bowl diameter, fork ~19cm, palm ~10cm, takeout box.
   - Estimate each component's area/height, then convert to cooked edible grams BEFORE macros.
3. ESTIMATE PORTION (visual/mixed only) with anchors:
   - Typical chicken breast meal: 140-200g cooked. Use 200-250g ONLY when the plate is clearly piled with thick strips/breast covering most of the plate.
   - Strip chicken: count strips × 25-35g (thick/wide). Thin strips ≈20-25g. Do not invent hidden chicken under greens.
   - Prawns/shrimp: count pieces × 12-20g peeled cooked (large tiger ~20-25g; small ~8-12g). Bowl curry often 100-160g prawn meat.
   - Egg ~50g (~6g protein); deck-of-cards meat ~85g
   - Rice/pasta anchors (cooked edible): fist side ~150-200g; half-plate mound ~220-280g; full-plate mound (rice fills most of a dinner plate) ~300-380g; heaped thali rice ~400g. Never call a heaped mound "half-plate".
   - If rice covers >half the visible plate area, it is a FULL-PLATE rice share (≥300g), even when curry sits beside it. "Half-plate" is ONLY when rice clearly occupies ≤half the plate.
   - Sambar/dal ladle ~150-220g; roti/chapati ~40-50g each; idli ~40g each; dosa ~80-120g
   - Paneer cube pile: count cubes × 15-20g; typical tikka serving 100-140g
   - Greens/gongura in curry: 80-150g cooked leaves+sauce share (side, not the calorie bulk). Size rice from plate fill first on rice+curry plates. Rice calories dominate; do not undercount rice to keep the total near 300 kcal.
   - Noodles (pho/ramen/pad Thai): cooked noodles ~180-250g bowl share; broth adds kcal but little protein
   - Tortilla/pita wrap: tortilla ~40-60g; pita ~60-80g; add filling meat separately
   - Oil: add "~1 tbsp olive oil/ghee" (~14g, ~120 kcal) when sautéed/glossy/fried/curry sheen; skip if dry/steamed
   - Protein bar ~60g; yogurt cup 125-170g
4. protein_g = estimated_grams × (protein/100g) / 100. Densities: chicken breast 31, prawn/shrimp 24, mutton/lamb 25, paneer 18, ground beef 26, pork 27, salmon 25, egg 13, greek yogurt 10, tofu 17, dal/lentils 9, sambar 3.5, kale/spinach/gongura 3, rice 2.7, roti 8, cheese 25, protein bar 30, oil/butter/ghee 0
5. calories_g = estimated_grams × (kcal/100g) / 100. Densities: chicken breast 165, prawn/shrimp 99, mutton 294, paneer 265, ground beef 250, pork 242, salmon 208, egg 155, greek yogurt 97, tofu 76, dal 116, sambar 55, rice 130, roti 297, pasta 131, cheese 350, protein bar 400, bread 265, olive oil/butter/ghee 717
6. SUM item protein → total_protein_g (±0.5g). SUM calories_g → calories (±15 kcal). Round grams to nearest 5g. Re-check totals vs item sum.

Rules:
- protein_source: label | visual | mixed (label wins totals when mixed)
- Never double-count oil already baked into fried/breaded item calories
- Skip zero-calorie garnishes (lemon, herbs, pickles) - curry leaves as tiny garnish ok to skip; bulk cooked gongura/palak is NOT a garnish
- estimated_grams = cooked edible weight only. Typical home dinner plate total food 350-650g incl. oil (rice-heavy plates often 400-550g food alone)
- confidence: low (ambiguous), medium (reasonable), high (clear size + familiar food)
- Never hallucinate invisible food. Notes ≤100 chars. No quotes/backslashes/newlines in strings.
- User notes never invent food: if the photo is clothing, fabric, skin, furniture, or otherwise not a meal, is_food=false even when the note names a dish.

Few-shots (adapt; do not copy blindly):
A) Full-plate grilled chicken strips ~210g + sautéed greens ~100g + parmesan ~8g + oil ~14g → protein ≈70g; kcal ≈510
B) 2 scrambled eggs + toast + butter → protein ~16g; kcal ~270
D) Non-food / empty plate → is_food=false
E) Label "Protein 50g" / "Calories 320" → use label values
F) Smaller strip plate (~7 thin strips ~150g) + dry greens (~80g), no oil → protein ~48g; kcal ~275
G) Sambar rice (full plate): rice ~320g + sambar ~200g → protein ~12g; kcal ~560
H) Paneer tikka ~120g + oil ~10g → protein ~22g; kcal ~340
I) Photo of fabric + note naming a dish → is_food=false
T) Gongura rice (rice mound fills most of plate): rice ~330g + gongura ~100g + oil ~14g → protein ~12g; kcal ~620. Never return ~300 kcal for a full rice+curry dinner plate. Half-plate rice only when rice clearly covers ≤half the plate.
${CUISINE_FEW_SHOTS}`

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
    if (!gate.allowed) return gate.response;
    const gatedUserId = gate.userId;

    const body = await req.json();
    const { image_base64, mime_type = "image/jpeg", user_note, text_only } = body;
    const userNote = sanitizeField(user_note, 280);
    const isTextOnly = Boolean(text_only) || (!image_base64 && !!userNote);

    if (isTextOnly) {
      if (userNote.length < 2) {
        return json({ error: "Describe your meal in a few words." }, 400);
      }
      if (OPENAI_API_KEY && !openaiCircuitOpen()) {
        try {
          const raw = await callOpenAITextOnly(userNote);
          return json({
            analysis: await normalizeStable(raw, userNote, gatedUserId),
            model: OPENAI_MODEL,
            provider: "openai",
            mode: "text",
          });
        } catch (openaiErr) {
          const openaiMessage =
            openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
          console.error("OpenAI text-only failed:", openaiMessage);
          if (isHardOpenAIFailure(openaiMessage)) {
            tripOpenAICircuit(openaiMessage);
          }
          if (GEMINI_API_KEY) {
            const raw = await callGeminiTextOnly(GEMINI_API_KEY, userNote);
            return json({
              analysis: await normalizeStable(raw, userNote, gatedUserId),
              model: GEMINI_MODELS[0] ?? "gemini",
              provider: "gemini",
              mode: "text",
              fallback_from: "openai",
              fallback_reason: openaiMessage.slice(0, 240),
            });
          }
          throw openaiErr;
        }
      }
      if (!GEMINI_API_KEY) {
        return json({ error: "AI service is not configured. Please try again later." }, 503);
      }
      const raw = await callGeminiTextOnly(GEMINI_API_KEY, userNote);
      return json({
        analysis: await normalizeStable(raw, userNote, gatedUserId),
        model: GEMINI_MODELS[0] ?? "gemini",
        provider: "gemini",
        mode: "text",
      });
    }

    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }

    if (OPENAI_API_KEY && !openaiCircuitOpen()) {
      try {
        const raw = await callOpenAI(image_base64, mime_type, userNote);
        return json({
          analysis: await normalizeStable(raw, userNote, gatedUserId),
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
            analysis: await normalizeStable(raw, userNote, gatedUserId),
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
        analysis: await normalizeStable(raw, userNote, gatedUserId),
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
    return json({
      analysis: await normalizeStable(raw, userNote, gatedUserId),
      model,
      provider: "gemini",
    });
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

USER NOTE (optional context — never override what the photo actually shows):
"${userNote}"

Fusion rules (strict):
1. PHOTO IS GROUND TRUTH: Decide is_food from the image alone first. Fabric, clothing, hands, desks, walls, empty plates, blur, or non-food → is_food=false with empty items and zeros, even if the note names a dish (e.g. "chicken biryani").
2. IDENTITY: Use the note only when the photo is clearly food AND the named dish/ingredients are compatible with what you see. If the note claims biryani/chicken/rice but the image is not that food, ignore the note for identity and macros.
3. PORTIONS: Explicit amounts in the note ("half plate", "2 eggs", "200g") apply only when those foods are actually visible.
4. food_name: Match user wording only when it fits the plate; otherwise name what you see (or empty if not food).
5. CONFLICTS: Photo wins on presence and non-food. Never invent protein from a misleading note. Mention the mismatch briefly in notes when you reject the note.`;
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
    maxOutputTokens: 768,
    responseMimeType: "application/json",
    responseSchema: GEMINI_SCHEMA,
  };

  // Low thinking budget: improves portion/oil reasoning vs 0, still much faster/cheaper than 768.
  // USDA density calibration still anchors macros after the model responds.
  if (supportsThinking(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: GEMINI_THINKING_BUDGET };
  }

  const basePrompt =
    attempt === 0 ? GEMINI_USER_ANALYZE_TEXT : GEMINI_USER_ANALYZE_RETRY_TEXT;

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

const TEXT_ONLY_PROMPT =
  "Estimate protein and calories from this meal description only (no photo). " +
  "Assume typical prepared portions unless amounts are stated. " +
  "Set is_food=true when the text clearly describes edible food; otherwise is_food=false. " +
  "Break into items with estimated_grams, protein_g, calories_g. Return JSON only.";

async function callOpenAITextOnly(userNote: string): Promise<Record<string, unknown>> {
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
          content: `${TEXT_ONLY_PROMPT}\n\nMEAL DESCRIPTION:\n"${userNote}"`,
        },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("OpenAI text-only error:", openaiRes.status, errText);
    const err = new Error("AI analysis failed. Please try again.") as Error & { status?: number };
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

async function callGeminiTextOnly(
  apiKey: string,
  userNote: string,
): Promise<Record<string, unknown>> {
  const model = GEMINI_MODELS[0] || "gemini-2.0-flash";
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          parts: [{ text: `${TEXT_ONLY_PROMPT}\n\nMEAL DESCRIPTION:\n"${userNote}"` }],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 768,
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
  return parseGeminiJson(textPart);
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
              text: OPENAI_USER_ANALYZE_TEXT + userNotePromptSuffix(userNote),
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
  const usage = completion?.usage ?? {};
  void recordAnalyzeUsage({
    requestId: String(completion?.id ?? ""),
    provider: "openai",
    model: OPENAI_MODEL,
    inputTokens: Number(usage.prompt_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? 0),
    cachedTokens: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
    imageCount: 1,
    status: "ok",
  });
  const content = completion?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI returned an empty response. Please try again.");
  }
  return JSON.parse(content);
}

function estimateGpt4oUsd(input: number, output: number, cached: number): number {
  return ((input - cached) * 2.5 + cached * 1.25 + output * 10) / 1_000_000;
}

function recordAnalyzeUsage(input: {
  requestId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  imageCount: number;
  status: string;
  retryCount?: number;
}) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  return fetch(`${url}/rest/v1/rpc/record_ai_usage`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_request_id: input.requestId || null,
      p_scan_id: null,
      p_provider: input.provider,
      p_model: input.model,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_cached_tokens: input.cachedTokens,
      p_image_count: input.imageCount,
      p_latency_ms: null,
      p_status: input.status,
      p_retry_count: input.retryCount ?? 0,
      p_estimated_cost_usd: estimateGpt4oUsd(
        input.inputTokens,
        input.outputTokens,
        input.cachedTokens,
      ),
      p_pricing_as_of: "2026-09-10",
    }),
  }).catch(() => {});
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

type NormalizedAnalysis = {
  is_food: boolean;
  food_name: string;
  items: Array<{
    name: string;
    portion: string;
    estimated_grams?: number;
    protein_g: number;
    confidence: string;
  }>;
  total_protein_g: number;
  calories: number;
  confidence: string;
  notes: string;
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

function minimumPlausibleGrams(name: string, portion: string): number {
  const n = name.toLowerCase();
  const p = portion.toLowerCase();
  if (/bowl/.test(p)) {
    if (/sambar|dal|dahl|curry|soup|stew|broth|ramen|pho|noodle/i.test(n)) return 120;
    if (/rice|pasta|quinoa|beans|chickpeas|chole|rajma|khichdi/i.test(n)) return 90;
    return 40;
  }
  if (/plate/.test(p)) return 90;
  if (/cup/.test(p)) return 35;
  if (/ladle/.test(p)) return 25;
  if (/tablespoon|tbsp/.test(p)) return 8;
  if (/teaspoon|tsp/.test(p)) return 3;
  if (/piece|slice|stick|floret|spear|handful/.test(p)) return 8;
  return 0;
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

  const idliMatch = note.match(/(\d+)\s*idlis?\b/);
  if (idliMatch) {
    const n = Math.min(10, Math.max(1, Number(idliMatch[1])));
    for (const item of next) {
      if (/\bidli/i.test(item.name)) item.estimated_grams = snapGrams(n * 40);
    }
  }

  const dosaMatch = note.match(/(\d+)\s*dosas?\b/);
  if (dosaMatch) {
    const n = Math.min(6, Math.max(1, Number(dosaMatch[1])));
    for (const item of next) {
      if (/\bdosa/i.test(item.name)) item.estimated_grams = snapGrams(n * 100);
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

  // Explicit plate-of-rice cues (common undercount: model says half-plate for a mound).
  if (/\b(full|large|big|huge|heaped|heaping)\s*plate\s*(of\s+)?rice\b/.test(note) ||
    /\brice\b.{0,12}\b(full|large|big|huge)\s*plate\b/.test(note)) {
    for (const item of next) {
      if (isPlainRiceItem(item.name)) item.estimated_grams = snapGrams(Math.max(item.estimated_grams ?? 0, 330));
    }
  } else if (/\b(half|1\/2)\s*plate\s*(of\s+)?rice\b/.test(note)) {
    for (const item of next) {
      if (isPlainRiceItem(item.name)) item.estimated_grams = snapGrams(Math.max(item.estimated_grams ?? 0, 250));
    }
  }

  let scale = 1;
  if (/\b(half|1\/2)\s*(plate|portion|serving|bowl)\b/.test(note) && !/\brice\b/.test(note)) {
    scale = 0.7;
  } else if (/\b(small|light)\s*(plate|portion|serving|bowl)?\b/.test(note)) scale = 0.8;
  else if (/\b(large|big|huge|full)\s*(plate|portion|serving|bowl)\b/.test(note)) scale = 1.2;
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
  /fried|deep.?fried|saut[eé]|pan.?fried|crispy|butter|oil|olive|curry|cream|cheese sauce|mayo|dressing|gravy|battered|breaded|roasted in|glossy|gongura|sorrel|palak|saag|pachadi|thoran|poriyal|sabzi/i;

function isPlainRiceItem(name: string): boolean {
  const n = name.toLowerCase();
  if (/biryani|pulao|pilaf|fried rice|nasi|risotto|rice and peas|rice pudding/i.test(n)) {
    return false;
  }
  return /\brice\b/.test(n);
}

function isCurrySideItem(name: string): boolean {
  return /gongura|sorrel|palak|sambar|dal|daal|curry|sabzi|rasam|sagu|chutney|pachadi|saag|poriyal|thoran|fry|gravy|stew|korma|saag/i.test(
    name,
  );
}

/**
 * Home rice + curry plates are chronically undercounted (half-plate ~180g rice → ~250 kcal).
 * Floor cooked rice grams from plate fill before density grounding.
 * Never trust model "half-plate" when rice sits next to a curry side.
 */
function applyStarchPlateFloors(
  items: NormalizedItem[],
  foodName: string,
): NormalizedItem[] {
  if (items.length === 0) return items;
  const hasRice = items.some((item) => isPlainRiceItem(item.name));
  if (!hasRice) return items;

  const riceMeal = /\brice\b|sambar rice|gongura rice|curd rice|lemon rice|tomato rice|pongal|pulihara|pulihora/i
    .test(foodName);
  const hasCurrySide = items.some((item) => isCurrySideItem(item.name));
  if (!riceMeal && !hasCurrySide) return items;

  return items.map((item) => {
    if (!isPlainRiceItem(item.name)) return item;
    const portion = (item.portion ?? "").toLowerCase();
    const grams = item.estimated_grams ?? 0;
    // Default: home rice+curry dinner = rice fills most of the plate (~320g+).
    let floorG = 320;
    if (/\b(full|large|big|huge|heaped|heaping|mound|generous)\b/.test(portion)) {
      floorG = 350;
    } else if (/\b(small|side|fist)\b/.test(portion) && !/\bplate\b/.test(portion)) {
      // Explicit small side of rice only (no "plate" word).
      floorG = 180;
    } else if (/\bhalf\b/.test(portion) || grams < 280) {
      // Model half-plate / low grams beside curry = full dinner rice share.
      floorG = 330;
    }
    if (grams >= floorG) return item;
    return {
      ...item,
      estimated_grams: snapGrams(Math.max(grams, floorG)),
      portion: /\bhalf\b/.test(portion) || grams < 250
        ? "full-plate share (~330g)"
        : item.portion,
      confidence: item.confidence === "high" ? "medium" : item.confidence,
    };
  });
}

/** Last-resort meal floor: rice+curry dinner plates are almost never under ~500 kcal. */
function enforceRiceMealCalorieFloor(
  items: NormalizedItem[],
  foodName: string,
  calories: number,
): { items: NormalizedItem[]; calories: number } {
  const hasRice = items.some((item) => isPlainRiceItem(item.name));
  const hasCurrySide = items.some((item) => isCurrySideItem(item.name));
  const riceMeal = /\brice\b/.test(foodName.toLowerCase());
  if (!hasRice || (!hasCurrySide && !riceMeal)) {
    return { items, calories };
  }
  if (calories >= 500) return { items, calories };

  const next = items.map((item) => {
    if (!isPlainRiceItem(item.name)) return item;
    const grams = Math.max(item.estimated_grams ?? 0, 330);
    const dens = lookupCalorieDensity(item.name) ?? 130;
    const proteinDens = lookupProteinDensity(item.name);
    return {
      ...item,
      estimated_grams: snapGrams(grams),
      portion: item.portion?.toLowerCase().includes("half")
        ? "full-plate share (~330g)"
        : item.portion,
      calories_g: Math.round(
        caloriesFromDensity(grams, dens) * CALORIE_REALISM_FACTOR,
      ),
      protein_g: proteinDens
        ? round1(proteinFromDensity(grams, proteinDens))
        : item.protein_g,
      confidence: item.confidence === "high" ? "medium" : item.confidence,
    };
  });

  // Ensure cooking fat is present for oily greens curries.
  const withFat = ensureCookingFatCalories(next);
  const nextCalories = Math.max(
    520,
    withFat.reduce((s, i) => s + i.calories_g, 0),
  );
  return { items: withFat, calories: nextCalories };
}

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

function normalize(raw: Record<string, unknown>, userNote = ""): NormalizedAnalysis {
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
    const safeName = sanitizeField(item.name, 60) || "Unknown";
    const safePortion = sanitizeField(item.portion, 80);
    const rawGrams = Math.round(Number(item.estimated_grams) || 0);
    const snappedGrams = rawGrams > 0 ? snapGrams(rawGrams) : undefined;
    const minimum = fromLabel ? 0 : minimumPlausibleGrams(safeName, safePortion);
    const grams = snappedGrams != null && snappedGrams > 0
      ? Math.max(snappedGrams, minimum)
      : undefined;
    const calorieDensity = grams ? lookupCalorieDensity(String(item.name ?? "")) : null;
    const llmCalories = Math.round(Number(item.calories_g) || 0);
    const fallbackCalories =
      grams && calorieDensity ? caloriesFromDensity(grams, calorieDensity) : llmCalories;

    return {
      name: safeName,
      portion: safePortion,
      estimated_grams: grams,
      protein_g: round1(Number(item.protein_g) || 0),
      calories_g: llmCalories > 0 ? llmCalories : fallbackCalories,
      confidence: String(item.confidence ?? "medium"),
    } satisfies NormalizedItem;
  });

  const hinted = applyUserNotePortionHints(baseItems, userNote);
  const floored = applyStarchPlateFloors(hinted, String(raw.food_name ?? ""));
  let items = ensureCookingFatCalories(
    floored
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
        calories_g: labelCalories ?? Math.max(Math.round(labelProtein * 4), 0),
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

  // Hard floor for rice+curry plates (fixes half-plate ~180g → ~290 kcal failure mode).
  {
    const flooredMeal = enforceRiceMealCalorieFloor(
      items,
      String(raw.food_name ?? ""),
      calories,
    );
    items = flooredMeal.items;
    calories = flooredMeal.calories;
    total = round1(items.reduce((s, i) => s + i.protein_g, 0)) || total;
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

async function normalizeStable(
  raw: Record<string, unknown>,
  userNote: string,
  userId: string | null,
): Promise<NormalizedAnalysis> {
  const normalized = normalize(raw, userNote);
  return await stabilizeAgainstRecentScans(normalized, userId);
}

function normalizeMealKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMeal(value: string): Set<string> {
  return new Set(
    normalizeMealKey(value)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function readItemNames(rawItems: unknown): string[] {
  if (!Array.isArray(rawItems)) return [];
  const out: string[] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const maybeName = (raw as { name?: unknown }).name;
    if (typeof maybeName !== "string") continue;
    const clean = maybeName.trim();
    if (clean) out.push(clean);
  }
  return out;
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  const denom = Math.max(a.size, b.size);
  return denom > 0 ? common / denom : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function blendTowardMedian(current: number, targetMedian: number, tolerance: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(targetMedian)) return current;
  if (Math.abs(current - targetMedian) > tolerance) return current;
  return current * 0.2 + targetMedian * 0.8;
}

async function stabilizeAgainstRecentScans(
  analysis: NormalizedAnalysis,
  userId: string | null,
): Promise<NormalizedAnalysis> {
  if (!analysis.is_food) return analysis;
  if (!userId || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return analysis;

  const currentFoodKey = normalizeMealKey(analysis.food_name);
  if (!currentFoodKey) return analysis;
  // Do not reinforce historically undercounted rice/curry plates.
  if (/\brice\b/.test(currentFoodKey) && analysis.calories > 0 && analysis.calories < 450) {
    return analysis;
  }
  const currentTokens = tokenizeMeal(
    [analysis.food_name, ...analysis.items.map((item) => item.name)].join(" "),
  );

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  // Lean fetch: recent matches only (was 40 + second auth.getUser).
  const { data } = await admin
    .from("protein_logs")
    .select("food_name, items, protein_g, calories")
    .eq("user_id", userId)
    .in("source", ["photo", "photo_scan"])
    .gte("created_at", sinceIso)
    .gt("protein_g", 0)
    .not("calories", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);

  if (!data?.length) return analysis;

  const proteinHits: number[] = [];
  const calorieHits: number[] = [];

  for (const row of data as Array<{
    food_name?: string | null;
    items?: unknown;
    protein_g?: number | null;
    calories?: number | null;
  }>) {
    const foodName = typeof row.food_name === "string" ? row.food_name : "";
    const rowFoodKey = normalizeMealKey(foodName);
    if (!rowFoodKey || rowFoodKey !== currentFoodKey) continue;

    const rowItemNames = readItemNames(row.items);
    const rowTokens = tokenizeMeal([foodName, ...rowItemNames].join(" "));
    const overlap = tokenOverlap(currentTokens, rowTokens);
    if (currentTokens.size > 0 && rowTokens.size > 0 && overlap < 0.45) continue;

    const protein = Number(row.protein_g);
    const calories = Number(row.calories);
    // Ignore historically undercounted rice plates when building the median.
    if (/\brice\b/.test(rowFoodKey) && Number.isFinite(calories) && calories > 0 && calories < 450) {
      continue;
    }
    if (Number.isFinite(protein) && protein > 0) proteinHits.push(protein);
    if (Number.isFinite(calories) && calories > 0) calorieHits.push(calories);
  }

  if (proteinHits.length < 2 || calorieHits.length < 2) return analysis;

  const proteinMedian = median(proteinHits);
  const calorieMedian = median(calorieHits);

  const nextProtein = round1(
    blendTowardMedian(
      analysis.total_protein_g,
      proteinMedian,
      Math.max(6, proteinMedian * 0.2),
    ),
  );
  const nextCalories = Math.round(
    blendTowardMedian(
      analysis.calories,
      calorieMedian,
      Math.max(90, calorieMedian * 0.22),
    ),
  );

  if (nextProtein === analysis.total_protein_g && nextCalories === analysis.calories) {
    return analysis;
  }

  return {
    ...analysis,
    total_protein_g: nextProtein > 0 ? nextProtein : analysis.total_protein_g,
    calories: nextCalories > 0 ? nextCalories : analysis.calories,
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

type ScanGateResult =
  | { allowed: true; userId: string | null }
  | { allowed: false; response: Response };

async function enforcePhotoScanLimit(req: Request): Promise<ScanGateResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return { allowed: true, userId: null };
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return {
      allowed: false,
      response: json({ error: "Sign in required to scan meals." }, 401),
    };
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const userId = userData.user?.id;
  if (userError || !userId) {
    return {
      allowed: false,
      response: json({ error: "Sign in required to scan meals." }, 401),
    };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().slice(0, 10);
  // Profile, paywall, and both scan counts in one round-trip batch.
  const [{ data: profile }, { data: paywallCfg }, lifetimeRes, todayRes] = await Promise.all([
    admin
      .from("profiles")
      .select("is_premium, created_at")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("app_paywall_config")
      .select("promo_unlimited_until")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("protein_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("source", ["photo", "manual"]),
    // Count only photo_scan rows — each AI analysis records one. Do NOT also
    // count logged `photo` meals or free users effectively get ~2 scans (scan+log
    // would burn two slots toward FREE_DAILY_SCANS).
    admin
      .from("protein_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("logged_date", today)
      .eq("source", "photo_scan"),
  ]);

  const decision = canScanPhoto({
    isPremium: profile?.is_premium === true,
    createdAt: profile?.created_at ?? null,
    scansUsedToday: todayRes.count ?? 0,
    lifetimeMeals: lifetimeRes.count ?? 0,
    promoUnlimitedUntil: paywallCfg?.promo_unlimited_until ?? null,
  });

  if (!decision.allowed) {
    return {
      allowed: false,
      response: json({ error: decision.message ?? "Daily scan limit reached." }, 403),
    };
  }

  return { allowed: true, userId };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
