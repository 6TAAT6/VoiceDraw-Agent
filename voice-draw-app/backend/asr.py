"""VoiceDraw Agent — 讯飞 实时语音转写大模型 ASR 客户端
参考：https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html
"""
import hmac, hashlib, base64, json, uuid, asyncio
from datetime import datetime, timezone
from urllib.parse import quote
import websockets
from config import XUNFEI_APP_ID, XUNFEI_API_KEY, XUNFEI_API_SECRET

ASR_URL = "wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1"

def _utc_string() -> str:
    now = datetime.now(timezone.utc).astimezone()
    return now.strftime("%Y-%m-%dT%H:%M:%S%z")

def _generate_signature(params: dict, api_secret: str) -> str:
    sorted_keys = sorted(params.keys())
    base = "&".join(f"{quote(k, safe='')}={quote(params[k], safe='')}" for k in sorted_keys)
    return base64.b64encode(hmac.new(api_secret.encode(), base.encode(), hashlib.sha1).digest()).decode()

def _build_url() -> str:
    params = {
        "accessKeyId": XUNFEI_API_KEY, "appId": XUNFEI_APP_ID,
        "audio_encode": "pcm_s16le", "lang": "autodialect",
        "samplerate": "16000", "utc": _utc_string(), "uuid": str(uuid.uuid4()),
    }
    sig = _generate_signature(params, XUNFEI_API_SECRET)
    all_p = {**params, "signature": sig}
    qs = "&".join(f"{quote(k,safe='')}={quote(all_p[k],safe='')}" for k in sorted(all_p.keys()))
    return f"{ASR_URL}?{qs}"

def _extract_text(data: dict) -> str | None:
    """从讯飞识别结果中提取文本"""
    cn = data.get("cn") if isinstance(data, dict) else None
    if not cn: return None
    st = cn.get("st") if cn else None
    if not st or not st.get("rt"): return None
    words = []
    for seg in st["rt"]:
        for ws in seg.get("ws", []):
            for cw in ws.get("cw", []):
                w = cw.get("w", "")
                if w: words.append(w)
    return "".join(words) or None


async def _stream_to_iflytek(pcm_data: bytes) -> str:
    """流式发送 PCM 到讯飞，收到最终结果后返回文本"""
    url = _build_url()
    final_text = ""
    handshake_ok = asyncio.Event()
    result_done = asyncio.Event()

    try:
        async with websockets.connect(url, ping_interval=20, max_size=2**24) as ws:

            async def reader():
                nonlocal final_text
                try:
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                        except json.JSONDecodeError:
                            continue

                        data = msg.get("data") if isinstance(msg.get("data"), dict) else {}

                        # 握手
                        if data.get("action") == "started":
                            handshake_ok.set()
                            print("[ASR] 握手成功")
                            continue

                        # 错误
                        if data.get("action") == "error":
                            print(f"[ASR] 服务端错误: {json.dumps(data, ensure_ascii=False)[:300]}")
                            result_done.set()
                            continue

                        code = data.get("code")
                        if code is not None and str(code) != "0":
                            print(f"[ASR] code={code} {data.get('message','')}")
                            result_done.set()
                            continue

                        # 识别结果
                        if msg.get("msg_type") == "result" and msg.get("res_type") == "asr":
                            text = _extract_text(data)
                            st_type = data.get("cn", {}).get("st", {}).get("type") if isinstance(data.get("cn"), dict) else None
                            if text:
                                if st_type == "0":
                                    final_text += text
                                    print(f"[ASR] ✅ final: {text}")
                                    # 拿到最终结果就标记完成（单次识别只需一句话）
                                    if not result_done.is_set():
                                        result_done.set()
                                else:
                                    print(f"[ASR] partial: {text}")
                except websockets.ConnectionClosed:
                    pass
                except Exception as e:
                    print(f"[ASR] reader error: {e}")

            read_task = asyncio.create_task(reader())

            # 等握手
            try:
                await asyncio.wait_for(handshake_ok.wait(), timeout=5)
            except asyncio.TimeoutError:
                print("[ASR] 握手超时")
                read_task.cancel()
                return ""

            # 发 PCM
            total = len(pcm_data)
            for i in range(0, total, 5120):
                await ws.send(pcm_data[i:i+5120])
                await asyncio.sleep(0.01)

            # 发结束标记
            await ws.send(json.dumps({"type": "end"}))
            print(f"[ASR] PCM 发送完成 ({total} bytes)，等待识别...")

            # 等最终结果（最多 8 秒）
            try:
                await asyncio.wait_for(result_done.wait(), timeout=8)
            except asyncio.TimeoutError:
                print("[ASR] 超时，关闭连接")

            # 关闭连接以释放 reader
            await ws.close()
            try:
                await asyncio.wait_for(read_task, timeout=3)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                read_task.cancel()

    except Exception as e:
        print(f"[ASR] 异常: {e}")
        return ""

    return final_text.strip()


async def recognize(pcm_bytes: bytes) -> str:
    if not XUNFEI_APP_ID or not XUNFEI_API_KEY or not XUNFEI_API_SECRET:
        print("[ASR] 密钥未配置")
        return ""
    if len(pcm_bytes) < 320:
        print("[ASR] 音频太短")
        return ""

    dur = len(pcm_bytes) / 32000
    print(f"[ASR] 收到 PCM: {len(pcm_bytes)} bytes ({dur:.1f}s)")
    text = await _stream_to_iflytek(pcm_bytes)
    print(f"[ASR] 结果: {text or '(空)'}")
    return text
