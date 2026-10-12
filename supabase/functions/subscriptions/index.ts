// M1 Part 1.1: replaces flight-save-subscription + flight-list-subscriptions + API Gateway.
// POST {plan_name, target_price} saves a subscription; GET lists the caller's subscriptions.
// The email comes from the verified Supabase session, not from the request body.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PLANS: Record<string, { origin: string; destination: string }> = {
  tokyo: { origin: "TPE", destination: "TYO" },
  seoul: { origin: "TPE", destination: "SEL" },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  const email = auth?.user?.email?.toLowerCase();
  if (authErr || !email) return json(401, { error: "請先登入" });

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("subscriptions")
      .select("route,plan_name,origin,destination,target_price,currency,created_at,updated_at")
      .eq("email", email);
    if (error) return json(500, { error: error.message });
    return json(200, { email, subscriptions: data });
  }

  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body: { plan_name?: string; target_price?: number | string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON" });
  }
  const plan = PLANS[body.plan_name ?? ""];
  const target = Number(body.target_price);
  if (!plan) return json(400, { error: "plan_name 必須是 tokyo 或 seoul" });
  if (!Number.isFinite(target) || target <= 0)
    return json(400, { error: "target_price 必須是正數（TWD）" });

  const route = `${plan.origin}-${plan.destination}`;
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("created_at")
    .eq("email", email)
    .eq("route", route)
    .maybeSingle();
  const row = {
    email,
    route,
    plan_name: body.plan_name,
    origin: plan.origin,
    destination: plan.destination,
    target_price: Math.round(target),
    currency: "TWD",
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const { error } = await admin.from("subscriptions").upsert(row);
  if (error) return json(500, { error: error.message });
  return json(200, { ok: true, subscription: row });
});
