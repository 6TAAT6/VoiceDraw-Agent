// VoiceDraw Agent — Intent Router 四级分流 + 连续指令切分
import { preprocess, matchL1, matchL2, matchL8 } from './rule-engine.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''

function matchL3(text) {
  const map = {
    '登录页': 'login-page', '登录': 'login-page', '注册': 'login-page',
    '架构图': 'system-arch', '系统架构': 'system-arch',
    'ER图': 'er-diagram', 'ER 图': 'er-diagram', '数据库': 'er-diagram',
    '流程图': 'flowchart', '仪表盘': 'dashboard', 'dashboard': 'dashboard',
    '思维导图': 'mindmap', '脑图': 'mindmap',
  }
  for (const [key, template] of Object.entries(map)) {
    if (text.includes(key)) return { source: 'L3', cmd: 'template', args: template, raw: text }
  }
  return null
}

async function matchL4(text) {
  try {
    const res = await fetch(`${API_BASE}/api/plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, canvas_size: { width: 1200, height: 800 } }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return { source: 'L4', cmd: 'plan', args: data, raw: text }
  } catch (err) {
    console.warn('[IntentRouter] L4 失败:', err.message)
    return null
  }
}

export async function route(rawText) {
  const text = preprocess(rawText)
  if (!text) return { source: 'preprocess', cmd: 'noop', args: null, raw: rawText }
  const result = matchL1(text) || matchL2(text) || matchL3(text) || await matchL4(text) || matchL8(text)
    || { source: 'none', cmd: 'unknown', args: null, raw: text }
  result.raw = rawText // 保留原始文本，供颜色提取
  return result
}

export function splitCommands(text) {
  const byPunct = text.split(/[，,、;；。.]+/).filter(Boolean)
  if (byPunct.length > 1) return byPunct.map(s => s.trim())
  const byConj = text.split(/然后|再|接着|之后|并且/).filter(Boolean)
  if (byConj.length > 1) return byConj.map(s => s.trim())
  const verbs = ['画', '创建', '删除', '移动', '修改', '连接', '撤销', '重做', '清空', '保存', '导出']
  const parts = []; let last = 0
  for (let i = 0; i < text.length; i++) {
    if (verbs.some(v => text.startsWith(v, i)) && i > last) { parts.push(text.slice(last, i).trim()); last = i }
  }
  if (last < text.length) parts.push(text.slice(last).trim())
  return parts.length > 1 ? parts.filter(Boolean) : [text]
}
