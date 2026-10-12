// M1 Part 1.2: one route per invocation. Fetch the cheapest fare next month (TWD gate, USD
// best-effort), scan subscriptions for that route, enqueue every subscriber whose target is met.
// No subscription_status filter in M1 (that arrives with the M2 paywall).
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type Fare = {
  price: number;
  currency: string;
  airline: string | null;
  depart_date: string | null;
  return_date: string | null;
};

async function fetchCheapest(
  origin: string,
  destination: string,
  month: string,
  token: string,
  currency: string,
): Promise<Fare | null> {
  const q = new URLSearchParams({ origin, destination, depart_date: month, currency, token });
  try {
    const r = await fetch(`https://api.travelpayouts.com/v1/prices/cheap?${q}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!r.ok) {
      console.log(`travelpayouts ${currency} HTTP ${r.status}`);
      return null;
    }
    const body = await r.json();
    if (!body.success || !body.data) return null;
    const offers = Object.values(body.data[destination] ?? {}) as Record<string, unknown>[];
    if (!offers.length) return null;
    const best = offers.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a));
    return {
      price: best.price as number,
      currency: currency.toUpperCase(),
      airline: (best.airline as string) ?? null,
      depart_date: (best.departure_at as string) ?? null, // real keys: departure_at / return_at
      return_date: (best.return_at as string) ?? null,
    };
  } catch (e) {
    console.log(`travelpayouts ${currency} error`, String(e));
    return null;
  }
}

function nextMonth(): string {
  const d = new Date();
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  // Only the wrapper (service role) may call this; deployed with verify_jwt=false.
  if (req.headers.get("Authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)
    return new Response("forbidden", { status: 403 });
  const { origin, destination, route } = await req.json();
  const token = Deno.env.get("TRAVELPAYOUTS_TOKEN")!;
  const month = nextMonth();

  const tw = await fetchCheapest(origin, destination, month, token, "twd");
  if (!tw) {
    console.log("no TWD fare for", route, "(empty/429) - skipping");
    return Response.json({ ok: true, route, matched: 0 });
  }
  const us = await fetchCheapest(origin, destination, month, token, "usd"); // may be null, never blocks
  console.log(
    `${route} ${month} cheapest ${tw.price} TWD${us ? ` / ${us.price} USD` : ""} (${tw.airline})`,
  );

  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("email,plan_name,target_price")
    .eq("route", route);
  if (error) throw error;

  let matched = 0;
  for (const s of subs ?? []) {
    if (Number(s.target_price) < tw.price) continue;
    const msg: Record<string, unknown> = {
      email: s.email,
      route,
      plan_name: s.plan_name,
      target_price: Number(s.target_price),
      cheapest: { ...tw, currency: "TWD" },
    };
    if (us) msg.cheapest_usd = { ...us, currency: "USD" };
    const { error: qErr } = await admin.rpc("fare_queue_send", { msg });
    if (qErr) throw qErr;
    matched++;
  }
  console.log(`${route}: ${subs?.length ?? 0} subscribers, ${matched} enqueued`);
  return Response.json({
    ok: true,
    route,
    month,
    cheapest_twd: tw.price,
    cheapest_usd: us?.price ?? null,
    matched,
  });
});
