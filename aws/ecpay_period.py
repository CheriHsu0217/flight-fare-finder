# flight-ecpay-period: POST /ecpay-period. ECPay's result for the 2nd+ 定期定額 charges.
# Success -> keep active + extend current_period_end. Failure -> count it; ECPay terminates the
# series after 6 consecutive failures, only then -> expired.
import boto3, json, base64, hashlib, calendar, urllib.parse as U
from datetime import datetime, timezone

ddb = boto3.resource("dynamodb").Table("subscriptions")
sm = boto3.client("secretsmanager")
F = "%Y-%m-%dT%H:%M:%SZ"
MAX_FAILS = 6


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
        print("SimulatePaid=1: ack only, no bookkeeping", tn)
        return text("1|OK")
    key = {"email": email, "route": route}
    row = ddb.get_item(Key=key).get("Item")
    if not row or row.get("merchant_trade_no") != tn:
        print("no row for", key, "with trade no", tn)
        return text("1|OK")
    now = datetime.now(timezone.utc)
    n = now.strftime(F)
    st = row.get("subscription_status")
    if p.get("RtnCode") == "1":
        base = max(now, datetime.strptime(row.get("current_period_end", n), F).replace(tzinfo=timezone.utc))
        end = plus_month(base)
        # A charge on a cancelled series keeps it cancelled (grace just extends); otherwise active.
        # If ECPay ran its last scheduled charge, let it lapse at current_period_end via the cancelled path.
        last = p.get("ExecTimes") and p.get("TotalSuccessTimes") == p.get("ExecTimes")
        new = "cancelled" if st == "cancelled" or last else "active"
        ddb.update_item(Key=key, UpdateExpression=(
            "SET subscription_status=:s, current_period_end=:e, current_period_end_date=:d, last_charged_at=:n,"
            " total_success_times=:c, failed_attempts=:z, updated_at=:n"),
            ExpressionAttributeValues={":s": new, ":e": end.strftime(F), ":d": end.strftime("%Y-%m-%d"), ":n": n,
                                       ":c": int(p.get("TotalSuccessTimes") or 0), ":z": 0})
        print("RENEWED", key, tn, new, "until", end.strftime(F))
    else:
        fails = int(row.get("failed_attempts", 0)) + 1
        expr, vals = "SET failed_attempts=:f, last_failed_at=:n, updated_at=:n", {":f": fails, ":n": n}
        if fails >= MAX_FAILS:
            expr += ", subscription_status=:x"
            vals[":x"] = "expired"
        ddb.update_item(Key=key, UpdateExpression=expr, ExpressionAttributeValues=vals)
        print("renewal FAILED", key, tn, p.get("RtnCode"), p.get("RtnMsg"), "consecutive", fails)
    return text("1|OK")
