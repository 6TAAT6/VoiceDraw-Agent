"""VoiceDraw Agent — 七牛云 Kodo 存储 (上传/下载/列表/删除)"""
import json
import asyncio
import qiniu
from qiniu import Auth, put_data, BucketManager
from config import QINIU_KODO_ACCESS_KEY, QINIU_KODO_SECRET_KEY, QINIU_KODO_BUCKET

_bucket_domain = None


def _get_auth():
    return Auth(QINIU_KODO_ACCESS_KEY, QINIU_KODO_SECRET_KEY)


def _get_bucket_mgr():
    return BucketManager(_get_auth())


async def upload_json(key: str, data: dict) -> bool:
    """上传 JSON 对象到 Kodo，key 为路径如 project_20250101.json"""
    if not QINIU_KODO_ACCESS_KEY:
        return False
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    token = _get_auth().upload_token(QINIU_KODO_BUCKET, key, 3600)
    try:
        ret, info = await asyncio.to_thread(put_data, token, key, body)
        if info.status_code != 200:
            print(f"[Kodo] 上传失败: key={key}, code={info.status_code}")
            return False
        return True
    except Exception as e:
        print(f"[Kodo] 上传异常: {e}")
        return False


async def download_json(key: str) -> dict | None:
    """从 Kodo 下载 JSON 对象"""
    if not QINIU_KODO_ACCESS_KEY:
        return None
    domain = await _get_domain()
    url = f"http://{domain}/{key}"
    try:
        import requests
        r = await asyncio.to_thread(requests.get, url, timeout=10)
        if r.status_code == 200:
            return r.json()
        return None
    except Exception as e:
        print(f"[Kodo] 下载异常: {e}")
        return None


async def list_files(prefix: str = "project_", limit: int = 20) -> list[str]:
    """列出指定前缀的文件"""
    if not QINIU_KODO_ACCESS_KEY:
        return []
    try:
        ret, info = await asyncio.to_thread(
            _get_bucket_mgr().list, QINIU_KODO_BUCKET, prefix=prefix, limit=limit
        )
        if info.status_code != 200:
            return []
        return [item.get("key") for item in ret.get("items", [])]
    except Exception as e:
        print(f"[Kodo] 列表异常: {e}")
        return []


async def delete_file(key: str) -> bool:
    """删除 Kodo 文件"""
    if not QINIU_KODO_ACCESS_KEY:
        return False
    try:
        ret, info = await asyncio.to_thread(
            _get_bucket_mgr().delete, QINIU_KODO_BUCKET, key
        )
        return info.status_code == 200
    except Exception as e:
        print(f"[Kodo] 删除异常: {e}")
        return False


async def _get_domain() -> str:
    """获取 Kodo 空间外网域名"""
    global _bucket_domain
    if _bucket_domain:
        return _bucket_domain
    try:
        ret, info = await asyncio.to_thread(
            _get_bucket_mgr().bucket_domain, QINIU_KODO_BUCKET
        )
        if ret and len(ret) > 0:
            _bucket_domain = ret[0]
        else:
            _bucket_domain = f"{QINIU_KODO_BUCKET}.qiniucdn.com"
    except Exception:
        _bucket_domain = f"{QINIU_KODO_BUCKET}.qiniucdn.com"
    return _bucket_domain
