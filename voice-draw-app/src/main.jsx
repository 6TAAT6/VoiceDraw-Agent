import React, { useCallback, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, useEditor, createShapeId } from 'tldraw'
import 'tldraw/tldraw.css'
import { startListening, stopListening, checkSupport as checkSTT } from './speech.js'
import { speak, checkSupport as checkTTS } from './tts.js'
import { route, splitCommands } from './intent-router.js'
import { loadScene } from './templates.js'
import { layout } from './layout-engine.js'
import { toListening, toThinking, toDrawing, toSpeaking, toIdle, confirm as smConfirm, hasPendingConfirm, onChange } from './state-machine.js'

import { set as setAlias, snapshot, restore } from './canvas-memory.js'

// ====== Task → Shape 映射 ======
const TYPE_MAP = {
  sidebar:       { w: 200, h: 400, label: '侧边栏' },
  navbar:        { w: 600, h: 48,  label: '导航栏' },
  'card-grid':   { w: 400, h: 280, label: '卡片区' },
  card:          { w: 160, h: 100, label: '卡片' },
  button:        { w: 100, h: 36,  label: '按钮' },
  input:         { w: 200, h: 32,  label: '输入框' },
  table:         { w: 400, h: 200, label: '表格' },
  'chart-area':  { w: 300, h: 200, label: '图表区' },
  'hero-section':{ w: 500, h: 200, label: '主区域' },
  footer:        { w: 600, h: 40,  label: '页脚' },
  'search-bar':  { w: 240, h: 32,  label: '搜索' },
  form:          { w: 300, h: 240, label: '表单' },
  text:          { w: 120, h: 32,  label: '文本' },
}

function executePlan(editor, plan) {
  const tasks = (plan.tasks || []).filter(t => t.action === 'create')
  if (!tasks.length) return 0

  const vp = editor.getViewportPageBounds()
  const hint = plan.layout_hint || 'centered'

  const positioned = layout(hint, tasks, { w: vp.w, h: vp.h })
  let drawn = 0

  for (const p of positioned) {
    const def = TYPE_MAP[p.type]
    const x = vp.x + p.x
    const y = vp.y + p.y

    if (!def) {
      editor.createShape({
        id: createShapeId(), type: 'text', x, y,
        props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: p.type || '?' }] }] } },
      })
      drawn++
      continue
    }

    const id = createShapeId()
    editor.createShape({
      id, type: 'geo', x, y,
      props: { geo: 'rectangle', w: p.w, h: p.h, color: 'light-violet' },
    })

    if (def.label) {
      editor.createShape({
        id: createShapeId(), type: 'text', x: x + 8, y: y + 4,
        props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: def.label }] }] } },
      })
    }

    if (p.alias) setAlias(p.alias, id, p.type)
    drawn++
  }

  return drawn
}

function updateStatusUI(state, payload) {
  const text = document.getElementById('status-text')
  const dot = document.getElementById('status-dot')
  if (!text || !dot) return
  const s = {
    idle: { text: '就绪', dotClass: 'dot-idle' },
    listening: { text: '正在听...', dotClass: 'dot-listening' },
    thinking: { text: '思考中...', dotClass: 'dot-thinking' },
    confirming: { text: payload?.message || '确认操作？', dotClass: 'dot-thinking' },
    clarifying: { text: payload?.options?.join(' / ') || '请选择', dotClass: 'dot-thinking' },
    drawing: { text: '绘制中...', dotClass: 'dot-thinking' },
    speaking: { text: '播报中...', dotClass: 'dot-speaking' },
    error: { text: '出错了', dotClass: 'dot-error' },
  }[state] || { text: '就绪', dotClass: 'dot-idle' }
  text.textContent = s.text
  dot.className = s.dotClass
}

function VoiceDrawInner() {
  const editor = useEditor()
  const isListening = useRef(false)

  useEffect(() => {
    window.__editor = editor
    return onChange(updateStatusUI)
  }, [editor])

  useEffect(() => {
    // 启动时恢复最近快照
    fetch('/api/snapshot/latest').then(r => r.json()).then(d => {
      if (d?.data && typeof d.data === 'string') {
        try {
          const doc = JSON.parse(d.data)
          if (doc.records) {
            editor.store.mergeRemoteChanges(() => {
              for (const r of doc.records) {
                editor.store.put([r])
              }
            })
          }
        } catch (_) {}
      }
      // 恢复 alias 内存
      if (d?.alias) restore(d.alias)
    }).catch(() => {})
    // 每 30 秒自动保存
    const timer = setInterval(() => {
      const doc = editor.store.serialize()
      const aliasData = snapshot()
      const payload = {
        alias: Object.fromEntries(aliasData),
        data: JSON.stringify(doc),
      }
      if (!payload.data) return
      fetch('/api/snapshot/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const executeCommand = useCallback(async (result) => {
    if (!result || result.cmd === 'noop' || result.cmd === 'unknown') return
    toDrawing()
    const { cmd, args } = result
    try {
      const selected = editor.getSelectedShapes()
      const vp = editor.getViewportPageBounds()
      const cx = vp.x + vp.w / 2
      const cy = vp.y + vp.h / 2

      switch (cmd) {
        case 'create': {
          const geoMap = { circle: 'ellipse', rect: 'rectangle', triangle: 'triangle', diamond: 'diamond' }
          const colorMap = { '红':'red','蓝':'blue','绿':'green','黄':'yellow','黑':'black','白':'white','紫':'purple','橙':'orange','灰':'gray' }
          const extractColor = () => {
            for (const [cn, ce] of Object.entries(colorMap)) {
              if (result.raw && result.raw.includes(cn)) return ce
            }
            return null
          }
          const geo = geoMap[args]
          const color = extractColor()
          if (geo) {
            const props = { geo, w: 100, h: 100 }
            if (color) props.color = color
            editor.createShape({ id: createShapeId(), type: 'geo', x: cx - 50, y: cy - 50, props })
          } else if (args && args.startsWith('label:')) {
            editor.createShape({ id: createShapeId(), type: 'text', x: cx, y: cy, props: { richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: args.replace('label:', '') }] }] } } })
          } else if (TYPE_MAP[args]) {
            const def = TYPE_MAP[args]
            editor.createShape({ id: createShapeId(), type: 'geo', x: cx - def.w / 2, y: cy, props: { geo: 'rectangle', w: def.w, h: def.h, color: 'light-violet' } })
          } else {
            editor.createShape({ id: createShapeId(), type: args === 'arrow' ? 'arrow' : 'line', x: cx - 50, y: cy })
          }
          break
        }
        case 'color':
          selected.forEach(s => editor.updateShape({ id: s.id, type: s.type, props: { ...s.props, color: args } }))
          break
        case 'scale': {
          const f = parseFloat(args)
          selected.forEach(s => {
            const p = s.props; const w = (p.w || 100) * f; const h = (p.h || 100) * f
            editor.updateShape({ id: s.id, type: s.type, x: s.x - (w - (p.w || 100)) / 2, y: s.y - (h - (p.h || 100)) / 2, props: { ...p, w, h } })
          })
          break
        }
        case 'move': {
          const vp = editor.getViewportPageBounds()
          const pos = { left: { x: vp.x + 80, y: 'keep' }, right: { x: vp.x + vp.w - 200, y: 'keep' }, center: { x: vp.x + vp.w / 2 - 50, y: vp.y + vp.h / 2 - 50 }, top: { x: 'keep', y: vp.y + 80 }, bottom: { x: 'keep', y: vp.y + vp.h - 200 } }[args]
          if (!pos) break
          selected.forEach(s => editor.updateShape({ id: s.id, type: s.type, x: pos.x === 'keep' ? s.x : pos.x, y: pos.y === 'keep' ? s.y : pos.y }))
          break
        }
        case 'undo': editor.undo(); break
        case 'save':
          speak('正在保存').catch(() => {})
          const doc = editor.store.serialize()
          const aliasData = Object.fromEntries(snapshot())
          fetch('/api/snapshot/save', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias: aliasData, data: JSON.stringify(doc) }),
          }).then(r => r.json()).then(d => {
            if (d.ok) speak('已保存').catch(() => {})
            else speak('保存失败').catch(() => {})
          }).catch(() => speak('保存失败').catch(() => {}))
          break
        case 'redo': editor.redo(); break
        case 'clear':
          const ids = [...editor.getCurrentPageShapeIds()]
          if (!ids.length) break
          smConfirm('确认清空画布上全部图形？', () => {
            editor.deleteShapes(ids)
            speak('已清空').catch(() => {})
          })
          break
        case 'delete': editor.deleteShapes([...editor.getSelectedShapeIds()]); break
        case 'group': editor.groupShapes([...editor.getSelectedShapeIds()]); break
        case 'ungroup': editor.ungroupShapes([...editor.getSelectedShapeIds()]); break
        case 'selectAll': editor.selectAll(); break
        case 'template':
          speak('收到，正在绘制').catch(() => {})
          const tmpl = loadScene(args)
          if (tmpl) { const n = executePlan(editor, tmpl); if (n) speak(`已绘制${n}个组件`).catch(() => {}) }
          break
        case 'plan':
          speak('收到，正在绘制').catch(() => {})
          const count = executePlan(editor, args || {})
          if (count) speak(`已绘制${count}个组件`).catch(() => {})
          else speak('未能解析绘图指令').catch(() => {})
          break
      }
      if (cmd === 'create') speak('画好了').catch(() => {})
    } catch (err) {
      console.error(err)
      updateStatusUI('error'); setTimeout(() => toIdle(), 2000)
    } finally { if (!hasPendingConfirm()) toIdle() }
  }, [editor])

  const handleSpeech = useCallback(async () => {
    if (isListening.current) {
      stopListening(); isListening.current = false
      document.getElementById('mic-btn')?.classList.remove('listening'); toIdle(); return
    }
    isListening.current = true
    document.getElementById('mic-btn')?.classList.add('listening'); toListening()
    startListening({
      onInterim: (t) => { const el = document.getElementById('status-text'); if (el) el.textContent = t || '正在听...' },
      onResult: async (text) => {
        toThinking(); stopListening(); isListening.current = false
        document.getElementById('mic-btn')?.classList.remove('listening')
        for (const c of splitCommands(text)) await executeCommand(await route(c))
      },
      onError: () => { updateStatusUI('error'); isListening.current = false; document.getElementById('mic-btn')?.classList.remove('listening'); setTimeout(() => toIdle(), 2000) },
    })
  }, [executeCommand])

  useEffect(() => {
    const btn = document.getElementById('mic-btn')
    const input = document.getElementById('text-input')
    if (!btn || !input) return
    btn.addEventListener('click', handleSpeech)
    const onKey = (e) => { if (e.key === ' ' && e.target === document.body) { e.preventDefault(); handleSpeech() } }
    document.addEventListener('keydown', onKey)
    const onInput = async (e) => {
      if (e.key !== 'Enter') return
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      toThinking()
      for (const c of splitCommands(text)) await executeCommand(await route(c))
    }
    input.addEventListener('keydown', onInput)
    return () => {
      btn.removeEventListener('click', handleSpeech)
      document.removeEventListener('keydown', onKey)
      input.removeEventListener('keydown', onInput)
    }
  }, [handleSpeech, executeCommand])

  useEffect(() => { console.log('[VoiceDraw] STT:', checkSTT(), 'TTS:', checkTTS()); toIdle() }, [])
  return null
}

function App() {
  return <div style={{ width: '100vw', height: '100vh' }}><Tldraw><VoiceDrawInner /></Tldraw></div>
}
createRoot(document.getElementById('app')).render(<App />)
