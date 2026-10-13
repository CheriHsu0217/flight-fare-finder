# flight-cancel-subscription: POST /cancel {email, route}. Stops future ECPay charges
# (CreditCardPeriodAction Action=Cancel) and sets cancelled - service continues until current_period_end.
import boto3, json, hashlib, calendar, time, urllib.parse as U, urllib.request
from datetime import datetime, timezone

ddb = boto3.resource("dynamodb").Table("subscriptions")
sm = boto3.client("secretsmanager")
sqs = boto3.client("sqs")
QURL = sqs.get_queue_url(QueueName="flight-status-queue")["QueueUrl"]
F = "%Y-%m-%dT%H:%M:%SZ"
H = {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}


def enc(s):
    e = U.quote_plus(s).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def cmv(p, k, v):  # SHA256 CheckMacValue; keeps empty-string fields (ECPay signs CustomField3= etc.)
    b = "&".join(f"{x}={p[x]}" for x in sorted((x for x in p if x != "CheckMacValue"), key=str.lower))
    return hashlib.sha256(enc(f"HashKey={k}&{b}&HashIV={v}").encode()).hexdigest().upper()


def resp(status, body):
    return {"statusCode": status, "headers": H, "body": json.dumps(body, default=str)}


def plus_month(d):
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.replace(year=y, month=m, day=min(d.day, calendar.monthrange(y, m)[1]))


def ecpay_cancel(s, tn):
    p = {"MerchantID": s["merchant_id"], "MerchantTradeNo": tn, "Action": "Cancel", "TimeStamp": str(int(time.time()))}
    p["CheckMacValue"] = cmv(p, s["hash_key"], s["hash_iv"])
    host = "payment-stage" if s.get("env", "stage") == "stage" else "payment"
    req = urllib.request.Request(f"https://{host}.ecpay.com.tw/Cashier/CreditCardPeriodAction",
                                 data=U.urlencode(p).encode(), method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            out = dict(U.parse_qsl(r.read().decode(), keep_blank_values=True))
    except Exception as e:
        out = {"RtnCode": "error", "RtnMsg": str(e)}
    print("ECPay CreditCardPeriodAction Cancel", tn, out)
    return out


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return resp(400, {"error": "invalid JSON"})
    key = {"email": str(body.get("email", "")).strip().lower(), "route": str(body.get("route", ""))}
    row = ddb.get_item(Key=key).get("Item")
    if not row:
        return resp(404, {"error": "subscription not found"})
    if row.get("subscription_status") != "active":
        return resp(409, {"error": f"cannot cancel a {row.get('subscription_status', 'legacy')} subscription"})
    s = json.loads(sm.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    out = ecpay_cancel(s, row["merchant_trade_no"])  # failure (e.g. 90100150 on stage) still cancels locally
    now = datetime.now(timezone.utc)
    end = row.get("current_period_end") or plus_month(now).strftime(F)
    end_date = row.get("current_period_end_date") or end[:10]
    ddb.update_item(Key=key, UpdateExpression=(
        "SET subscription_status=:c, current_period_end=:e, current_period_end_date=:d, cancelled_at=:n, updated_at=:n"),
        ExpressionAttributeValues={":c": "cancelled", ":e": end, ":d": end_date, ":n": now.strftime(F)})
    sqs.send_message(QueueUrl=QURL, MessageBody=json.dumps(
        {"event_type": "cancel", **key, "merchant_trade_no": row["merchant_trade_no"], "current_period_end_date": end_date}))
    return resp(200, {"ok": True, "subscription_status": "cancelled", "current_period_end_date": end_date,
                      "ecpay": {"RtnCode": out.get("RtnCode"), "RtnMsg": out.get("RtnMsg")}})
