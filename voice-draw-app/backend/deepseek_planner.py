"""VoiceDraw Agent — DeepSeek Planner + L7 JSON 修复"""
import json, re, os
import httpx
from config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL

_prompt_path = os.path.join(os.path.dirname(__file__), "..", "prompts", "planner_system.txt")
with open(_prompt_path, encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()

async def plan(text: str, canvas_memory: dict = None, canvas_size: dict = None) -> dict | None:
    if not DEEPSEEK_API_KEY:
        return None
    memory_str = json.dumps(canvas_memory or {}, ensure_ascii=False)
    size_str = f"{canvas_size.get('width', 1200)} x {canvas_size.get('height', 800)}" if canvas_size else "1200 x 800"
    user_prompt = SYSTEM_PROMPT.replace("{user_text}", text).replace("{canvas_memory}", memory_str).replace("{canvas_width} x {canvas_height}", size_str)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            resp = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"},
                json={"model": "deepseek/deepseek-v4-flash", "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}], "temperature": 0.1, "max_tokens": 1024},
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"[Planner] API 失败: {e}")
        return None
    return _repair(raw)

def _repair(raw: str) -> dict | None:
    if not raw: return None
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\n?```$', '', raw)
    start = raw.find('{')
    if start == -1: return None
    raw = raw[start:]
    open_braces = raw.count('{') - raw.count('}')
    open_brackets = raw.count('[') - raw.count(']')
    raw = re.sub(r',\s*$', '', raw)
    raw += '}' * max(0, open_braces) + ']' * max(0, open_brackets)
    raw = re.sub(r',\s*([}\]])', r'\1', raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None
