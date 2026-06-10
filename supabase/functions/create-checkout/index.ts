// Creates a Stripe Checkout Session for ProteinQuest Pro.
// Secrets: STRIPE_SECRET_KEY, STRIPE_PRICE_WEEKLY, STRIPE_PRICE_YEARLY (optional)

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const PRICE_WEEKLY = Deno.env.get("STRIPE_PRICE_WEEKLY") ?? Deno.env.get("STRIPE_PRICE_MONTHLY");
const PRICE_YEARLY = Deno.env.get("STRIPE_PRICE_YEARLY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY) {
    return json(
      { error: "Stripe is not configured. Set STRIPE_SECRET_KEY in Supabase secrets." },
      503,
    );
  }

  try {
    const { plan_id, success_url, cancel_url, customer_email, user_id } = await req.json();
    const priceId = plan_id === "pro_yearly" ? PRICE_YEARLY : PRICE_WEEKLY;
    if (!priceId) {
      return json({ error: "Stripe price ID not configured for this plan." }, 503);
    }

    const body = new URLSearchParams({
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: success_url ?? "https://proteinquest.vercel.app/?checkout=success",
      cancel_url: cancel_url ?? "https://proteinquest.vercel.app/",
      ...(customer_email ? { customer_email } : {}),
      ...(user_id ? { client_reference_id: user_id, "metadata[user_id]": user_id } : {}),
    });

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.text();
      console.error("Stripe error:", err);
      return json({ error: "Could not start checkout." }, 502);
    }

    const session = await stripeRes.json();
    return json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json({ error: "Unexpected checkout error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
