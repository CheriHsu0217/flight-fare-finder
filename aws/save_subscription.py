# flight-save-subscription: POST /subscribe {email, plan_name, target_price}.
# M2: new/unpaid rows -> pending_payment + ECPay 定期定額 auto-submit form (text/html).
# active or cancelled-in-grace rows -> in-place target update (application/json), no re-payment.
import boto3, json, hashlib, secrets, urllib.parse as U
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from html import escape

PLANS = {"tokyo": ("TPE", "TYO"), "seoul": ("TPE", "SEL"), "london": ("TPE", "LON")}
API = "https://3yke1ofvt0.execute-api.ap-southeast-2.amazonaws.com"
ddb = boto3.resource("dynamodb").Table("subscriptions")
sm = boto3.client("secretsmanager")
H = {"Access-Control-Allow-Origin": "*"}


def enc(s):
    e = U.quote_plus(s).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def cmv(p, k, v):  # SHA256 CheckMacValue; keeps empty-string fields (ECPay signs CustomField3= etc.)
    b = "&".join(f"{x}={p[x]}" for x in sorted((x for x in p if x != "CheckMacValue"), key=str.lower))
    return hashlib.sha256(enc(f"HashKey={k}&{b}&HashIV={v}").encode()).hexdigest().upper()


def resp(status, body, ctype="application/json"):
    b = body if isinstance(body, str) else json.dumps(body, default=str)
    return {"statusCode": status, "headers": {**H, "Content-Type": ctype}, "body": b}


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except ValueError:
        return resp(400, {"error": "invalid JSON"})
    email = str(body.get("email", "")).strip().lower()
    plan = PLANS.get(body.get("plan_name"))
    try:
        target = Decimal(str(body.get("target_price"))).quantize(Decimal(1))
    except (InvalidOperation, TypeError):
        target = Decimal(0)
    if "@" not in email or not plan or target <= 0:
        return resp(400, {"error": "email, plan_name (tokyo/seoul/london) and positive target_price required"})

    route = f"{plan[0]}-{plan[1]}"
    now = datetime.now(timezone.utc)
    iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
    row = ddb.get_item(Key={"email": email, "route": route}).get("Item") or {}
    st = row.get("subscription_status")
    if st == "active" or (st == "cancelled" and row.get("current_period_end", "") >= iso):
        ddb.update_item(Key={"email": email, "route": route}, UpdateExpression="SET target_price=:t, updated_at=:u",
                        ExpressionAttributeValues={":t": target, ":u": iso})
        return resp(200, {"ok": True, "updated": True, "subscription_status": st})

    tn = "FP" + now.strftime("%y%m%d%H%M%S") + secrets.token_hex(3)
    ddb.put_item(Item={**row, "email": email, "route": route, "plan_name": body["plan_name"], "origin": plan[0],
                       "destination": plan[1], "target_price": target, "currency": "TWD",
                       "subscription_status": "pending_payment", "merchant_trade_no": tn,
                       "created_at": row.get("created_at", iso), "updated_at": iso})

    s = json.loads(sm.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    amt = str(int(s["amount"]))
    p = {"MerchantID": s["merchant_id"], "MerchantTradeNo": tn, "PaymentType": "aio", "ChoosePayment": "Credit",
         "MerchantTradeDate": (now + timedelta(hours=8)).strftime("%Y/%m/%d %H:%M:%S"), "EncryptType": "1",
         "TotalAmount": amt, "PeriodAmount": amt, "PeriodType": "M", "Frequency": "1", "ExecTimes": "999",
         "ItemName": f"Flight Price Notifier {route} 月訂閱", "TradeDesc": "Flight Price Notifier monthly",
         "ReturnURL": f"{API}/ecpay-return", "PeriodReturnURL": f"{API}/ecpay-period",
         "OrderResultURL": f"{API}/ecpay-result", "CustomField1": email, "CustomField2": route}
    p["CheckMacValue"] = cmv(p, s["hash_key"], s["hash_iv"])
    host = "payment-stage" if s.get("env", "stage") == "stage" else "payment"
    fields = "".join(f'<input type="hidden" name="{k}" value="{escape(v)}">' for k, v in p.items())
    html = (f'<!doctype html><meta charset="utf-8"><p>前往綠界付款頁…</p>'
            f'<form method="post" action="https://{host}.ecpay.com.tw/Cashier/AioCheckOut/V5">{fields}</form>'
            '<script>document.forms[0].submit()</script>')
    print(f"checkout {email} {route} {tn} NT${amt}")
    return resp(200, html, "text/html; charset=utf-8")
