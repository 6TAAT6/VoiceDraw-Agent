"""VoiceDraw Agent — 配置管理"""
import os
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
if ENV_FILE.exists():
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

DEEPSEEK_API_KEY = os.getenv("QINIU_DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("QINIU_DEEPSEEK_BASE_URL", "https://api.qiniu.com/v1")
QINIU_ASR_ACCESS_KEY = os.getenv("QINIU_ASR_ACCESS_KEY", "")
QINIU_ASR_SECRET_KEY = os.getenv("QINIU_ASR_SECRET_KEY", "")
QINIU_KODO_ACCESS_KEY = os.getenv("QINIU_KODO_ACCESS_KEY", "")
QINIU_KODO_SECRET_KEY = os.getenv("QINIU_KODO_SECRET_KEY", "")
QINIU_KODO_BUCKET = os.getenv("QINIU_KODO_BUCKET", "voicedraw-projects")
QINIU_KODO_REGION = os.getenv("QINIU_KODO_REGION", "z0")
FASTAPI_HOST = os.getenv("FASTAPI_HOST", "0.0.0.0")
FASTAPI_PORT = int(os.getenv("FASTAPI_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5273").split(",")
