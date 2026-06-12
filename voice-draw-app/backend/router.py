"""VoiceDraw Agent — API 路由"""
import base64
from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from deepseek_planner import plan
from asr_auth import recognize
from kodo_uploader import upload_json, download_json, list_files

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
    from config import QINIU_ASR_ACCESS_KEY
    if QINIU_ASR_ACCESS_KEY:
        return {"available": True}
    return {"available": False, "reason": "ASR 密钥未配置"}


@router.post("/asr/recognize")
async def asr_recognize(audio: UploadFile = File(...)):
    """接收前端录音，base64 直传七牛短语音听写"""
    audio_bytes = await audio.read()
    b64 = base64.b64encode(audio_bytes).decode()
    text = await recognize(b64)
    if text:
        return {"text": text}
    return {"text": "", "error": "未识别到语音"}


@router.post("/snapshot/save")
async def snapshot_save(data: dict):
    """保存画布快照到 Kodo"""
    from datetime import datetime
    key = f"project_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    ok = await upload_json(key, data)
    return {"ok": ok, "key": key if ok else None}


@router.get("/snapshot/latest")
async def snapshot_latest():
    """恢复最近快照"""
    try:
        files = await list_files("project_", 5)
        if not files:
            return {"data": None}
        latest = sorted(files)[-1]
        data = await download_json(latest)
        return {"data": data}
    except Exception:
        return {"data": None}
