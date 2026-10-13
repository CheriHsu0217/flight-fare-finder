# flight-parser: one route per invocation. Fetch next month's cheapest fare (TWD gate, USD
# best-effort), scan subscriptions for the route, enqueue every PAYING subscriber whose target is met.
# M2 paywall: serve active + cancelled-in-grace (current_period_end >= now); lazily expire lapsed cancels.
import boto3, json, os, urllib.request, urllib.parse
from boto3.dynamodb.conditions import Attr
from datetime import datetime, timezone
from decimal import Decimal

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
F = "%Y-%m-%dT%H:%M:%SZ"  # same fixed-width UTC format the ECPay callbacks write
_sm = boto3.client("secretsmanager")
_ddb = boto3.resource("dynamodb").Table("subscriptions")
_sqs = boto3.client("sqs")
QURL = _sqs.get_queue_url(QueueName="flight-fare-queue")["QueueUrl"]


def fetch_cheapest(origin, destination, month, token, currency):
    q = urllib.parse.urlencode({"origin": origin, "destination": destination, "depart_date": month, "currency": currency, "token": token})
    req = urllib.request.Request(f"https://api.travelpayouts.com/v1/prices/cheap?{q}", headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = json.loads(r.read())
    except Exception as e:  # 429 / network: treat as no fare
        print(f"travelpayouts {currency} error: {e}")
        return None
    if not body.get("success") or not body.get("data"):
        return None
    offers = body["data"].get(destination, {})
    if not offers:
        return None
    best = min(offers.values(), key=lambda o: o["price"])
    return {"price": best["price"], "currency": currency.upper(), "airline": best.get("airline"),
            "depart_date": best.get("departure_at"), "return_date": best.get("return_at")}


def next_month():
    now = datetime.now(timezone.utc)
    y, m = (now.year + 1, 1) if now.month == 12 else (now.year, now.month + 1)
    return f"{y}-{m:02d}"


def paying(it, now):
    st = it.get("subscription_status")
    if st == "active":
        return True
    if st == "cancelled":
        if it.get("current_period_end", "") >= now:
            return True
        _ddb.update_item(Key={"email": it["email"], "route": it["route"]},
                         UpdateExpression="SET subscription_status=:x, updated_at=:n",
                         ConditionExpression="subscription_status=:c",
                         ExpressionAttributeValues={":x": "expired", ":n": now, ":c": "cancelled"})
        print("grace lapsed -> expired", it["email"], it["route"])
    return False  # pending_payment / expired / legacy (no status) are never alerted


def handler(event, context):
    origin, destination, route = event["origin"], event["destination"], event["route"]
    token = json.loads(_sm.get_secret_value(SecretId="flight/travelpayouts")["SecretString"])["token"]
    month = next_month()

    tw = fetch_cheapest(origin, destination, month, token, "twd")
    if not tw:
        print("no TWD fare for", route, "(empty/429) - skipping")
        return {"ok": True, "route": route, "matched": 0}
    us = fetch_cheapest(origin, destination, month, token, "usd")  # may be None - never blocks
    print(f"{route} {month} cheapest {tw['price']} TWD" + (f" / {us['price']} USD" if us else "") + f" ({tw['airline']})")

    scan = {"FilterExpression": Attr("route").eq(route)}
    items = []
    while True:
        page = _ddb.scan(**scan)
        items += page["Items"]
        if "LastEvaluatedKey" not in page:
            break
        scan["ExclusiveStartKey"] = page["LastEvaluatedKey"]

    now = datetime.now(timezone.utc).strftime(F)
    subs = [it for it in items if paying(it, now)]
    matched = 0
    for it in subs:
        tp = it["target_price"]
        if Decimal(tp) < Decimal(str(tw["price"])):
            continue
        body = {"email": it["email"], "route": route, "plan_name": it.get("plan_name"), "target_price": int(tp),
                "cheapest": {"price": tw["price"], "currency": "TWD", "airline": tw["airline"],
                             "depart_date": tw["depart_date"], "return_date": tw["return_date"]}}
        if us:
            body["cheapest_usd"] = {"price": us["price"], "currency": "USD", "airline": us["airline"],
                                    "depart_date": us["depart_date"], "return_date": us["return_date"]}
        _sqs.send_message(QueueUrl=QURL, MessageBody=json.dumps(body))
        matched += 1
    print(f"{route}: {len(items)} rows, {len(subs)} paying, {matched} enqueued")
    return {"ok": True, "route": route, "cheapest_twd": tw["price"], "paying": len(subs), "matched": matched}
