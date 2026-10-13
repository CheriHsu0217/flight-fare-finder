# flight-ecpay-return: POST /ecpay-return. ECPay's S2S result for the FIRST 定期定額 charge.
# The only thing (besides the period callback) that may set subscription_status=active.
import boto3, json, base64, hashlib, calendar, urllib.parse as U
from datetime import datetime, timezone

ddb = boto3.resource("dynamodb").Table("subscriptions")
sm = boto3.client("secretsmanager")
sqs = boto3.client("sqs")
QURL = sqs.get_queue_url(QueueName="flight-status-queue")["QueueUrl"]
F = "%Y-%m-%dT%H:%M:%SZ"  # fixed-width UTC: current_period_end is compared as a string


def enc(s):
    e = U.quote_plus(s).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def cmv(p, k, v):  # SHA256 CheckMacValue; keeps empty-string fields (ECPay signs CustomField3= etc.)
    b = "&".join(f"{x}={p[x]}" for x in sorted((x for x in p if x != "CheckMacValue"), key=str.lower))
    return hashlib.sha256(enc(f"HashKey={k}&{b}&HashIV={v}").encode()).hexdigest().upper()


def text(body, status=200):
    return {"statusCode": status, "headers": {"Content-Type": "text/plain; charset=utf-8"}, "body": body}


def plus_month(d):
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.replace(year=y, month=m, day=min(d.day, calendar.monthrange(y, m)[1]))


def parse(event):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    return dict(U.parse_qsl(body, keep_blank_values=True))


def handler(event, context):
    p = parse(event)
    s = json.loads(sm.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    if p.get("MerchantID") != s["merchant_id"] or p.get("CheckMacValue", "").upper() != cmv(p, s["hash_key"], s["hash_iv"]):
        print("REJECT invalid CheckMacValue/MerchantID", {k: v for k, v in p.items() if k != "CheckMacValue"})
        return text("0|CheckMacValueInvalid", 400)
    tn, email, route = p.get("MerchantTradeNo"), p.get("CustomField1", ""), p.get("CustomField2", "")
    print("verified", json.dumps({k: v for k, v in p.items() if k != "CheckMacValue"}, ensure_ascii=False))
    if p.get("SimulatePaid") == "1":
        print("SimulatePaid=1: ack only, not activating", tn)
        return text("1|OK")
    if p.get("RtnCode") != "1":
        print("first charge failed", tn, p.get("RtnCode"), p.get("RtnMsg"))
        return text("1|OK")
    key = {"email": email, "route": route}
    row = ddb.get_item(Key=key).get("Item")
    if not row:
        print("no subscription row for", key, tn)
        return text("1|OK")
    if row.get("subscription_status") == "active" and row.get("merchant_trade_no") == tn:
        print("already active for", tn, "- idempotent ack")
        return text("1|OK")
    now = datetime.now(timezone.utc)
    end = plus_month(now)
    ddb.update_item(Key=key, UpdateExpression=(
        "SET subscription_status=:a, merchant_trade_no=:t, current_period_end=:e, current_period_end_date=:d,"
        " activated_at=:n, last_charged_at=:n, failed_attempts=:z, updated_at=:n"),
        ExpressionAttributeValues={":a": "active", ":t": tn, ":e": end.strftime(F), ":d": end.strftime("%Y-%m-%d"),
                                   ":n": now.strftime(F), ":z": 0})
    sqs.send_message(QueueUrl=QURL, MessageBody=json.dumps(
        {"event_type": "welcome", "email": email, "route": route, "merchant_trade_no": tn,
         "amount": p.get("TradeAmt"), "current_period_end_date": end.strftime("%Y-%m-%d")}))
    print("ACTIVATED", key, tn, "until", end.strftime(F))
    return text("1|OK")
