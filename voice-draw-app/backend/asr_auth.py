"""VoiceDraw Agent — 七牛云 ASR Token 生成"""
import hmac
import hashlib
import base64
from config import QINIU_ASR_ACCESS_KEY, QINIU_ASR_SECRET_KEY

ASR_WS_URL = "wss://rtasr.qiniuapi.com/v1/realtime/asr"


def generate_asr_token() -> dict | None:
    """生成七牛云 ASR WebSocket 访问 token"""
    if not QINIU_ASR_ACCESS_KEY or not QINIU_ASR_SECRET_KEY:
        return None

    host = "rtasr.qiniuapi.com"
    path = "/v1/realtime/asr"
    signing_str = f"GET {path}\nHost: {host}\n\n"
    sign = hmac.new(
        QINIU_ASR_SECRET_KEY.encode("utf-8"),
        signing_str.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    encoded_sign = base64.urlsafe_b64encode(sign).decode("utf-8").rstrip("=")
    access_token = f"{QINIU_ASR_ACCESS_KEY}:{encoded_sign}"

    return {"url": ASR_WS_URL, "token": access_token}
