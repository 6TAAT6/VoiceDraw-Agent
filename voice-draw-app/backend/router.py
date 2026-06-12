"""VoiceDraw Agent — API 路由"""
from fastapi import APIRouter
from pydantic import BaseModel
from deepseek_planner import plan
from asr_auth import generate_asr_token

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
    return PlanResponse(intent=result.get("intent", "create_shapes"), scene_name=result.get("scene_name"), layout_hint=result.get("layout_hint"), tasks=result.get("tasks", []), tip=result.get("tip"))

@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/asr/token")
async def asr_token():
    result = generate_asr_token()
    if result is None:
        return {"available": False, "reason": "ASR 密钥未配置"}
    return {"available": True, **result}
