# flight-ecpay-result: ANY /ecpay-result. ECPay's OrderResultURL is a browser POST, which a static
# SPA answers with 405 - this only 302-redirects the shopper back. It never activates anything.
import base64, os, urllib.parse as U

SITE = os.environ.get("SITE_URL", "https://flight-fare-finder-habs.vercel.app")


def handler(event, context):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode()
    p = dict(U.parse_qsl(body, keep_blank_values=True))
    ok = p.get("RtnCode", "1") == "1"
    print("order result", p.get("MerchantTradeNo"), p.get("RtnCode"), p.get("RtnMsg"))
    return {"statusCode": 302, "headers": {"Location": f"{SITE}/app?purchase={'success' if ok else 'failed'}"}, "body": ""}
