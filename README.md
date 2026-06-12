# VoiceDraw Agent

纯语音控制绘图工具

## 技术栈

- 画布：tldraw v5
- 语音识别：Web Speech API + 七牛云 ASR
- LLM：DeepSeek (七牛云)
- 后端：Python FastAPI
- 存储：七牛云 Kodo

## 运行

```bash
cd voice-draw-app

# 前端
npm install
npm run dev

# 后端
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```
