// M1 Part 1.2: the pg_cron target (replaces EventBridge -> parser-wrapper Lambda).
// Reads the admin-managed flight_routes table, fans out one flight-parser call per route,
// then triggers flight-fare-notification to consume whatever was enqueued.
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, key);

Deno.serve(async () => {
  const { data: routes, error } = await admin
    .from("flight_routes")
    .select("plan,origin,destination");
  if (error) throw error;

  const results = await Promise.all(
    (routes ?? []).map(async (r) => {
      const payload = {
        origin: r.origin,
        destination: r.destination,
        route: `${r.origin}-${r.destination}`,
      };
      const res = await fetch(`${url}/functions/v1/flight-parser`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { route: payload.route, status: res.status, body: await res.json().catch(() => null) };
    }),
  );
  console.log("parser results", JSON.stringify(results));

  // Drain the queue right away (stands in for the SQS -> Lambda event-source mapping).
  const n = await fetch(`${url}/functions/v1/flight-fare-notification`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const notification = { status: n.status, body: await n.json().catch(() => null) };
  console.log("notification result", JSON.stringify(notification));
  return Response.json({ ok: true, results, notification });
});
