"""VoiceDraw Agent — API 路由"""
from fastapi import APIRouter

router = APIRouter(prefix="/api")

@router.get("/health")
async def health():
    return {"status": "ok"}
