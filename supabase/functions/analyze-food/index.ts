// Vision-based protein analysis. Returns structured JSON only — never hardcoded meals.
// Requires OPENAI_API_KEY secret. Optional OPENAI_MODEL (default gpt-4o).

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert sports nutritionist who estimates PROTEIN ONLY from food photos.

Your job:
1. Decide if the image contains food or drink intended for consumption.
2. If NOT food (empty plate, random object, person, scenery, receipt, etc.): set is_food=false, food_name="", items=[], total_protein_g=0, calories=0, confidence="low", notes explaining why.
3. If food: identify EVERY distinct component you can see — including sauces, cheese, toppings, bread, rice, legumes, protein powder, etc.
4. Estimate REALISTIC portions from visual cues (plate size ~25cm, hand scale, packaging labels, slice thickness, cup depth). Do NOT default to generic 150g chicken unless that size is plausible.
5. Estimate protein per item using standard nutrition data. Reason about protein sources: meat/poultry/fish, eggs, dairy, legumes, nuts, grains, protein supplements, etc.
6. When uncertain, use CONSERVATIVE (lower) protein estimates and mark confidence "low" on that item.
7. total_protein_g MUST equal the sum of item protein_g values (rounded to 1 decimal).
8. calories is a rough meal total (optional quality; still provide best estimate).

Coverage examples you MUST handle well:
- Desserts: cake, cookies, ice cream (usually low–moderate protein unless added protein)
- Fast food: burger, pizza, fries, tacos
- Indian/south Asian: curry, dal, naan, biryani, paneer dishes
- Asian: sushi, ramen, stir-fry, dim sum
- Breakfast: eggs, pancakes, oatmeal, protein shakes
- Snacks: protein bars, nuts, chips, fruit
- Restaurant mixed plates with multiple components
- Drinks: smoothies, milkshakes, protein shakes

Never hallucinate food that isn't visible. Never return placeholder meals.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_food: {
      type: "boolean",
      description:
        "True only if the image clearly shows food or drink for consumption",
    },
    food_name: {
      type: "string",
      description:
        "Short overall meal name, e.g. 'Chicken tikka masala with naan'. Empty string if not food.",
    },
    items: {
      type: "array",
      description: "Each distinct visible food/drink component",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          portion: {
            type: "string",
            description:
              "Realistic estimated portion, e.g. '2 slices (~90g)', '1 medium bowl (~300ml)'",
          },
          protein_g: { type: "number" },
          confidence: {
            type: "string",
            enum: ["low", "medium", "high"],
            description: "Confidence for this item's protein estimate",
          },
        },
        required: ["name", "portion", "protein_g", "confidence"],
      },
    },
    total_protein_g: { type: "number" },
    calories: { type: "number" },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Overall meal confidence",
    },
    notes: {
      type: "string",
      description:
        "One or two sentences: key assumptions, uncertainty, or why not food",
    },
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
    if (!OPENAI_API_KEY) {
      return json(
        {
          error:
            "AI analysis is not configured. Set OPENAI_API_KEY in Supabase secrets.",
        },
        503,
      );
    }

    const { image_base64, mime_type = "image/jpeg" } = await req.json();
    if (!image_base64) {
      return json({ error: "image_base64 is required" }, 400);
    }

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
            schema: RESPONSE_SCHEMA,
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
                  "Analyze this image. Return JSON only. If it is not food, set is_food=false and explain in notes. " +
                  "If it is food, break down all visible components with realistic portions and per-item protein estimates.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime_type};base64,${image_base64}`,
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
        /* use default */
      }
      return json({ error: message }, 502);
    }

    const completion = await openaiRes.json();
    const raw = JSON.parse(completion.choices[0].message.content);

    // Normalize totals and enforce non-food contract
    if (!raw.is_food) {
      return json({
        analysis: {
          is_food: false,
          food_name: "",
          items: [],
          total_protein_g: 0,
          calories: 0,
          confidence: "low",
          notes: raw.notes || "This doesn't look like food.",
        },
      });
    }

    const items = (raw.items ?? []).map((item: Record<string, unknown>) => ({
      name: String(item.name ?? "Unknown"),
      portion: String(item.portion ?? ""),
      protein_g: round1(Number(item.protein_g) || 0),
      confidence: item.confidence ?? "medium",
    }));

    const sum = round1(items.reduce((s: number, i: { protein_g: number }) => s + i.protein_g, 0));
    const total = round1(Number(raw.total_protein_g) || sum);

    const analysis = {
      is_food: true,
      food_name: String(raw.food_name || "Meal"),
      items,
      total_protein_g: Math.abs(total - sum) > 2 ? sum : total,
      calories: Math.round(Number(raw.calories) || 0),
      confidence: raw.confidence ?? "medium",
      notes: String(raw.notes ?? ""),
    };

    return json({ analysis, model: OPENAI_MODEL });
  } catch (err) {
    console.error("analyze-food error:", err);
    return json({ error: "Unexpected error analyzing the photo" }, 500);
  }
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
