# flight-fare-notification: SQS -> dedup -> Resend
import boto3, json, os, urllib.request, urllib.error, urllib.parse
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone
from decimal import Decimal
from html import escape

UA = "flight-notifier/1.0"
# Resend test mode only delivers to the account owner; while set, every email goes there instead.
REDIRECT = os.environ.get("TEST_REDIRECT_TO", "")
FLOOR_H = float(os.environ.get("NOTIFY_FLOOR_HOURS", "24"))
PCT = float(os.environ.get("REALERT_PCT", "20"))
ABS = float(os.environ.get("REALERT_ABS_TWD", "2000"))
CITY = {"TPE": "台北", "TYO": "東京", "SEL": "首爾"}
sm = boto3.client("secretsmanager")
hist = boto3.resource("dynamodb").Table("notification_history")
ntd = lambda n: f"NT${round(n):,}"
usd = lambda n: f"US${round(n):,}"
ymd = lambda s: (s or "")[:10]


def booking_url(route, f, marker=None):
    o, d = route.split("-")
    dm = lambda s: s[8:10] + s[5:7] if s else ""
    u = f"https://www.aviasales.com/search/{o}{dm(f.get('depart_date'))}{d}{dm(f.get('return_date'))}1?currency=twd"
    return u + "&marker=" + urllib.parse.quote(str(marker)) if marker else u


def render(m, url):
    f, tp = m["cheapest"], m["target_price"]
    o, d = (CITY.get(c, c) for c in m["route"].split("-"))
    up = m.get("cheapest_usd", {}).get("price")
    info = f"航空公司 {f.get('airline') or '-'}・去程 {ymd(f.get('depart_date'))}・回程 {ymd(f.get('return_date'))}"
    subject = f"✈️ {o} → {d} 降價通知！{ntd(f['price'])} 已達標"
    text = (f"{o} → {d} 最低票價 {ntd(f['price'])}" + (f"（約 {usd(up)}）" if up else "")
            + f"\n你的目標價：{ntd(tp)}\n{info}\n\n立即訂購：{url}")
    g = "font-size:14px;color:#555;margin:0"
    html = (f'<div style="font-family:Arial,sans-serif;max-width:520px">'
            f'<p style="{g}">{o} → {d}</p><p style="font-size:30px;font-weight:700;margin:4px 0">{ntd(f["price"])}</p>'
            + (f'<p style="{g}">約 {usd(up)}</p>' if up else "")
            + f'<p style="font-size:15px;margin:16px 0 4px">已達到你的目標價 {ntd(tp)}。</p><p style="{g}">{escape(info)}</p>'
            f'<p style="margin:24px 0"><a href="{escape(url)}" style="background:#0b6bcb;color:#fff;padding:12px 22px;border-radius:6px">立即訂購</a></p>'
            f'<p style="font-size:12px">票價以訂購頁面為準。</p></div>')
    return subject, html, text


def should_send(pk, new):
    last = hist.query(KeyConditionExpression=Key("pk").eq(pk), ScanIndexForward=False, Limit=1)["Items"]
    if not last:
        return True
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(last[0]["sent_at"])).total_seconds() / 3600
    prev = float(last[0]["price"])
    return age >= FLOOR_H or new <= prev * (1 - PCT / 100) or prev - new >= ABS


def send(sec, m):
    subject, html, text = render(m, booking_url(m["route"], m["cheapest"], sec.get("marker")))
    data = json.dumps({"from": sec.get("from") or "onboarding@resend.dev", "to": [REDIRECT or m["email"]],
                       "subject": (f"[測試轉寄 原收件人 {m['email']}] " if REDIRECT and REDIRECT != m["email"] else "") + subject, "html": html, "text": text}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=data, method="POST", headers={
        "Authorization": f"Bearer {sec['api_key']}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        urllib.request.urlopen(req, timeout=10).close()
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 429 or e.code >= 500:
            raise RuntimeError(f"resend transient {e.code}: {body}")
        print(f"resend permanent {e.code} for {m['email']}: {body}")
        return False


def handler(event, context):
    sec = json.loads(sm.get_secret_value(SecretId="flight/resend")["SecretString"])
    for rec in event["Records"]:
        m = json.loads(rec["body"])
        pk, price = f"{m['email']}#{m['route']}", m["cheapest"]["price"]
        if not should_send(pk, price):
            print(f"skipped (deduped) {pk} {price}")
        elif send(sec, m):
            hist.put_item(Item={"pk": pk, "sent_at": datetime.now(timezone.utc).isoformat(), "email": m["email"],
                                "route": m["route"], "price": Decimal(str(price)), "currency": "TWD"})
            print(f"sent {pk} {price} TWD")
    return {"ok": True}
