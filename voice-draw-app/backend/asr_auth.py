"""VoiceDraw Agent — 七牛云 ASR (HTTP 提交/查询模式)"""
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

# ASR 跟 DeepSeek 共用 base URL 和 API Key
ASR_SUBMIT_URL = f"{DEEPSEEK_BASE_URL}/voice/asr/submit"
ASR_QUERY_URL = f"{DEEPSEEK_BASE_URL}/voice/asr/query"


async def submit_asr(audio_url: str, audio_format: str = "wav") -> dict | None:
    """提交音频 URL 进行识别，返回 {reqid, ...}"""
    if not DEEPSEEK_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.post(
                ASR_SUBMIT_URL,
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "asr",
                    "audio": {
                        "format": audio_format,
                        "url": audio_url,
                    },
                },
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"[ASR] submit 失败: {e}")
        return None


async def query_asr(reqid: str) -> dict | None:
    """根据 reqid 查询识别结果"""
    if not DEEPSEEK_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.post(
                ASR_QUERY_URL,
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"reqid": reqid},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        print(f"[ASR] query 失败: {e}")
        return None
