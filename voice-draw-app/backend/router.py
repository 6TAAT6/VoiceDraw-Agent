"""VoiceDraw Agent — API 路由"""
import base64
import tempfile
import os
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from deepseek_planner import plan
from asr_auth import submit_asr, query_asr
import asyncio

router = APIRouter(prefix="/api")


class PlanRequest(BaseModel):
    text: str
    canvas_memory: dict | None = None
    canvas_size: dict | None = None


class PlanResponse(BaseModel):
    intent: str
    scene_name: str | None = None
    layout_hint: str | None = None
    tasks: list[dict] = []
    tip: str | None = None


@router.post("/plan", response_model=PlanResponse)
async def plan_endpoint(req: PlanRequest):
    result = await plan(req.text, req.canvas_memory, req.canvas_size)
    if result is None:
        return PlanResponse(intent="clarify", tip="DeepSeek 不可用", tasks=[])
    return PlanResponse(
        intent=result.get("intent", "create_shapes"),
        scene_name=result.get("scene_name"),
        layout_hint=result.get("layout_hint"),
        tasks=result.get("tasks", []),
        tip=result.get("tip"),
    )


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/asr/token")
async def asr_token():
    """检测 ASR 是否可用"""
    from config import DEEPSEEK_API_KEY
    if DEEPSEEK_API_KEY:
        return {"available": True}
    return {"available": False, "reason": "API Key 未配置"}


@router.post("/asr/recognize")
async def asr_recognize(audio: UploadFile = File(...)):
    """接收前端录音，调七牛 ASR 识别"""
    # 1) 读取音频
    audio_bytes = await audio.read()

    # 2) 保存为临时文件
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name

    # 3) 检测格式
    fmt = "wav"
    if audio.filename and audio.filename.endswith(".mp3"):
        fmt = "mp3"

    # 4) 先试 base64 data URL 直接传
    b64 = base64.b64encode(audio_bytes).decode()
    data_url = f"data:audio/{fmt};base64,{b64}"

    result = await submit_asr(data_url, fmt)

    # 5) data URL 不行就试本地文件路径
    if result is None:
        result = await submit_asr(f"file://{temp_path}", fmt)

    # 6) 轮询结果
    if result and result.get("reqid"):
        reqid = result["reqid"]
        for _ in range(30):  # 最多等 15 秒
            await asyncio.sleep(0.5)
            query_result = await query_asr(reqid)
            if query_result and query_result.get("data"):
                text = query_result["data"].get("text", "")
                os.unlink(temp_path)
                return {"text": text}
            if query_result and query_result.get("status") == "failed":
                break

    # 不支持的格式/失败 → 返回错误
    try:
        os.unlink(temp_path)
    except:
        pass
    return {"text": "", "error": "ASR 识别失败"}
