"""VoiceDraw Agent — 七牛云短语音听写 (base64 直传, 官方 SDK 签名)"""
import json
import asyncio
import requests
import qiniu
from qiniu import QiniuMacAuth
from config import QINIU_ASR_ACCESS_KEY, QINIU_ASR_SECRET_KEY

ASR_URL = "http://yitu-audio.qiniuapi.com/v2/asr"


async def recognize(audio_b64: str) -> str:
    """传 base64 音频，返回识别文本。失败返回空字符串。"""
    if not QINIU_ASR_ACCESS_KEY or not QINIU_ASR_SECRET_KEY:
        return ""

    body = {"audioBase64": audio_b64, "lang": "MANDARIN", "scene": "GENERAL"}
    auth = QiniuMacAuth(QINIU_ASR_ACCESS_KEY, QINIU_ASR_SECRET_KEY)
    qn_auth = qiniu.auth.QiniuMacRequestsAuth(auth)

    def _post():
        try:
            r = requests.post(ASR_URL, json=body, auth=qn_auth, timeout=15)
            return r
        except Exception as e:
            print(f"[ASR] {e}")
            return None

    resp = await asyncio.to_thread(_post)
    if resp is None or resp.status_code != 200:
        return ""

    data = resp.json()
    return data.get("resultText", "") if data.get("rtn") == 0 else ""
