// Analyzes a food photo with OpenAI vision and returns a protein estimate.
// Called by the app with a base64 JPEG; JWT verification is enabled, so only
// signed-in (incl. anonymous) users can invoke it.

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    is_food: {
      type: "boolean",
      description: "Whether the image clearly contains food or drink",
    },
    food_name: {
      type: "string",
      description: "Short name of the overall meal, e.g. 'Grilled chicken with rice'",
    },
    items: {
      type: "array",
      description: "Each distinct food item visible with its protein estimate",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          portion: {
            type: "string",
            description: "Estimated portion, e.g. '150g' or '1 cup'",
          },
          protein_g: { type: "number" },
        },
        required: ["name", "portion", "protein_g"],
      },
    },
    total_protein_g: { type: "number" },
    calories: {
      type: "number",
      description: "Rough total calories for the whole meal",
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: {
      type: "string",
      description: "One short sentence on what drives the estimate or its uncertainty",
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
      throw new Error("OPENAI_API_KEY secret is not configured");
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
        max_tokens: 800,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "protein_analysis",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You are a nutritionist specialized in estimating protein content from food photos. " +
              "Identify every food item, estimate realistic portion sizes, and estimate protein in grams " +
              "using standard nutrition data. Be decisive and practical: give your best single estimate. " +
              "If the image does not contain food, set is_food to false and zero out the numbers.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Estimate the protein content of this meal.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mime_type};base64,${image_base64}`,
                  detail: "low",
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
      return json({ error: "AI analysis failed, please try again" }, 502);
    }

    const completion = await openaiRes.json();
    const analysis = JSON.parse(completion.choices[0].message.content);

    return json({ analysis });
  } catch (err) {
    console.error("analyze-food error:", err);
    return json({ error: "Unexpected error analyzing the photo" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
