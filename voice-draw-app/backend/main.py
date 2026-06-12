"""VoiceDraw Agent — FastAPI 入口"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, FASTAPI_HOST, FASTAPI_PORT
from router import router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Backend] VoiceDraw 启动")
    yield

app = FastAPI(title="VoiceDraw Agent", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=FASTAPI_HOST, port=FASTAPI_PORT)
