// M1 Part 1.3: consume flight_fare_queue, dedup against notification_history, email via Resend.
// Only the wrapper (service role) may call this; deployed with verify_jwt=false.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)";
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const NOTIFY_FLOOR_HOURS = Number(Deno.env.get("NOTIFY_FLOOR_HOURS") ?? 24);
const REALERT_PCT = Number(Deno.env.get("REALERT_PCT") ?? 20);
const REALERT_ABS_TWD = Number(Deno.env.get("REALERT_ABS_TWD") ?? 2000);
const VISIBILITY_TIMEOUT = 180; // seconds, well above this function's run time
const MAX_RECEIVES = 5; // permanent-failure backstop (stands in for an SQS redrive policy)

type Fare = {
  price: number;
  currency: string;
  airline?: string | null;
  depart_date?: string | null;
  return_date?: string | null;
};
type Msg = {
  email: string;
  route: string;
  plan_name?: string;
  target_price: number;
  cheapest: Fare;
  cheapest_usd?: Fare;
};

const CITY: Record<string, string> = { TPE: "台北", TYO: "東京", SEL: "首爾" };
const ntd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;
const usd = (n: number) => `US$${Math.round(n).toLocaleString("en-US")}`;
const cities = (route: string) => route.split("-").map((c) => CITY[c] ?? c);
const ymd = (s?: string | null) => (s ? s.slice(0, 10) : "");
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Aviasales deep link ORIGIN+DDMM+DEST+DDMM; ?marker= only when given.
function bookingUrl(route: string, fare: Fare, marker?: string): string {
  const [o, d] = route.split("-");
  const ddmm = (s?: string | null) => (s ? s.slice(8, 10) + s.slice(5, 7) : "");
  const base = `https://www.aviasales.com/search/${o}${ddmm(fare.depart_date)}${d}${ddmm(fare.return_date)}1?currency=twd`;
  return marker ? `${base}&marker=${encodeURIComponent(marker)}` : base;
}

function subject(m: Msg): string {
  const [o, d] = cities(m.route);
  return `✈️ ${o} → ${d} 降價通知！${ntd(m.cheapest.price)} 已達標`;
}

function renderText(m: Msg, url: string): string {
  const [o, d] = cities(m.route);
  return [
    `${o} → ${d} 最低票價 ${ntd(m.cheapest.price)}${m.cheapest_usd ? `（約 ${usd(m.cheapest_usd.price)}）` : ""}`,
    `你的目標價：${ntd(m.target_price)}`,
    `航空公司：${m.cheapest.airline ?? "-"} ・ 去程 ${ymd(m.cheapest.depart_date)} ・ 回程 ${ymd(m.cheapest.return_date)}`,
    "",
    `立即訂購：${url}`,
    "",
    "票價隨時變動，以訂購頁面為準。",
  ].join("\n");
}

// Simple, table-free transactional HTML.
function renderHtml(m: Msg, url: string): string {
  const [o, d] = cities(m.route);
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
<p style="font-size:14px;color:#555;margin:0 0 4px">${esc(o)} → ${esc(d)}</p>
<p style="font-size:30px;font-weight:700;margin:0">${ntd(m.cheapest.price)}</p>
${m.cheapest_usd ? `<p style="font-size:14px;color:#555;margin:4px 0 0">約 ${usd(m.cheapest_usd.price)}</p>` : ""}
<p style="font-size:15px;margin:16px 0 4px">已達到你的目標價 ${ntd(m.target_price)}。</p>
<p style="font-size:14px;color:#555;margin:0">航空公司 ${esc(m.cheapest.airline ?? "-")}・去程 ${ymd(m.cheapest.depart_date)}・回程 ${ymd(m.cheapest.return_date)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#0b6bcb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">立即訂購</a></p>
<p style="font-size:12px;color:#888">票價隨時變動，以訂購頁面為準。</p>
</div>`;
}

// "send" | "skip": no recent alert, or a big enough drop since the last one.
async function decide(m: Msg): Promise<"send" | "skip"> {
  const { data } = await admin
    .from("notification_history")
    .select("sent_at,price")
    .eq("pk", `${m.email}#${m.route}`)
    .order("sent_at", { ascending: false })
    .limit(1);
  const last = data?.[0];
  if (!last) return "send";
  const ageH = (Date.now() - new Date(last.sent_at).getTime()) / 3_600_000;
  if (ageH >= NOTIFY_FLOOR_HOURS) return "send";
  const prev = Number(last.price),
    now = m.cheapest.price;
  return now <= prev * (1 - REALERT_PCT / 100) || prev - now >= REALERT_ABS_TWD ? "send" : "skip";
}

// "sent" | "drop" (permanent) ; throws on transient (429/5xx) so the message is redelivered.
async function sendEmail(m: Msg): Promise<"sent" | "drop"> {
  const url = bookingUrl(m.route, m.cheapest, Deno.env.get("TRAVELPAYOUTS_MARKER") || undefined);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") || "Flight Notifier <onboarding@resend.dev>",
      to: [m.email],
      subject: subject(m),
      html: renderHtml(m, url),
      text: renderText(m, url),
    }),
  });
  const body = await r.text();
  if (r.ok) return "sent";
  if (r.status === 429 || r.status >= 500) throw new Error(`resend transient ${r.status}: ${body}`);
  console.log(`resend permanent ${r.status} for ${m.email} - dropping: ${body}`);
  return "drop";
}

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)
    return new Response("forbidden", { status: 403 });

  const { data: batch, error } = await admin.rpc("fare_queue_read", {
    n: 10,
    vt: VISIBILITY_TIMEOUT,
  });
  if (error) throw error;

  const out: Record<string, number> = { sent: 0, skipped: 0, dropped: 0, retry: 0 };
  for (const { msg_id, read_ct, message } of batch ?? []) {
    const m = message as Msg;
    try {
      if ((await decide(m)) === "skip") {
        console.log(`skipped (deduped) ${m.email} ${m.route} ${m.cheapest.price}`);
        out.skipped++;
      } else if ((await sendEmail(m)) === "sent") {
        // history only after a 2xx
        await admin.from("notification_history").insert({
          pk: `${m.email}#${m.route}`,
          sent_at: new Date().toISOString(),
          email: m.email,
          route: m.route,
          price: m.cheapest.price,
          currency: "TWD",
        });
        console.log(`sent ${m.email} ${m.route} ${m.cheapest.price} TWD`);
        out.sent++;
      } else {
        out.dropped++;
      }
      await admin.rpc("fare_queue_delete", { id: msg_id });
    } catch (e) {
      console.log(`transient failure (read ${read_ct}) ${m.email} ${m.route}:`, String(e));
      if (read_ct >= MAX_RECEIVES) await admin.rpc("fare_queue_delete", { id: msg_id });
      out.retry++;
    }
  }
  return Response.json({ ok: true, ...out });
});
