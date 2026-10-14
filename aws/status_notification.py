# flight-status-notification: flight-status-queue -> Resend. ONE consumer for subscription status
# emails, routed by event_type ("welcome" | "cancel"). Each email is sent once per trade no.
import boto3, json, os, urllib.request, urllib.error
from botocore.exceptions import ClientError

UA = "flight-notifier/1.0"
# Resend test mode only delivers to the account owner; while set, every email goes there instead.
REDIRECT = os.environ.get("TEST_REDIRECT_TO", "")
CITY = {"TPE": "台北", "TYO": "東京", "SEL": "首爾", "LON": "倫敦"}
SITE = "https://flight-fare-finder-habs.vercel.app/app"
sm = boto3.client("secretsmanager")
ddb = boto3.resource("dynamodb").Table("subscriptions")


def render(m):
    o, d = (CITY.get(c, c) for c in m["route"].split("-"))
    end = m.get("current_period_end_date", "")
    if m["event_type"] == "welcome":
        subject = f"✈️ 訂閱成功：{o} → {d} 降價通知已啟用"
        lines = [f"感謝訂閱 Flight Price Notifier（NT${m.get('amount') or 300}/月）。",
                 f"{o} → {d} 的票價一旦低於你的目標價，我們會立即寄信通知你。",
                 f"本期有效至 {end}，之後每月自動續訂。"]
    else:
        subject = f"已取消訂閱：{o} → {d}"
        lines = ["你的訂閱已取消，之後不會再扣款。",
                 f"你已付費的這一期仍有效，{end} 前我們會繼續寄降價通知給你。"]
    text = "\n".join(lines) + f"\n\n管理訂閱：{SITE}"
    html = ('<div style="font-family:Arial,sans-serif;max-width:520px">'
            + "".join(f'<p style="font-size:15px;margin:8px 0">{l}</p>' for l in lines)
            + f'<p style="margin:24px 0"><a href="{SITE}" style="background:#0b6bcb;color:#fff;padding:12px 22px;'
              'border-radius:6px;text-decoration:none">管理訂閱</a></p></div>')
    return subject, html, text


def claim(m):
    # Once-only guard: record which trade no this event_type was sent for; a resend/replay is skipped.
    try:
        ddb.update_item(Key={"email": m["email"], "route": m["route"]},
                        UpdateExpression=f"SET {m['event_type']}_sent_for=:t",
                        ConditionExpression=f"attribute_not_exists({m['event_type']}_sent_for) OR {m['event_type']}_sent_for<>:t",
                        ExpressionAttributeValues={":t": m["merchant_trade_no"]})
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def send(sec, m):
    subject, html, text = render(m)
    data = json.dumps({"from": sec.get("from") or "onboarding@resend.dev", "to": [REDIRECT or m["email"]],
                       "subject": (f"[測試轉寄 原收件人 {m['email']}] " if REDIRECT and REDIRECT != m["email"] else "") + subject, "html": html, "text": text}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=data, method="POST", headers={
        "Authorization": f"Bearer {sec['api_key']}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        urllib.request.urlopen(req, timeout=10).close()
        print(f"sent {m['event_type']} to {m['email']} {m['route']}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        if e.code == 429 or e.code >= 500:
            raise RuntimeError(f"resend transient {e.code}: {body}")
        print(f"resend permanent {e.code} for {m['email']}: {body}")


def handler(event, context):
    sec = json.loads(sm.get_secret_value(SecretId="flight/resend")["SecretString"])
    for rec in event["Records"]:
        m = json.loads(rec["body"])
        if m.get("event_type") not in ("welcome", "cancel"):
            print("unknown event_type, dropping", m)
        elif not claim(m):
            print(f"skipped (already sent) {m['event_type']} {m['email']} {m['route']} {m['merchant_trade_no']}")
        else:
            try:
                send(sec, m)
            except Exception:  # transient: release the claim so the SQS retry can send it
                ddb.update_item(Key={"email": m["email"], "route": m["route"]},
                                UpdateExpression=f"REMOVE {m['event_type']}_sent_for")
                raise
    return {"ok": True}
