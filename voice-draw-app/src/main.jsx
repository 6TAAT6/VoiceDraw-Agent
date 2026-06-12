import React, { useCallback, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import { startListening, stopListening, checkSupport as checkSTT } from './speech.js'
import { speak, checkSupport as checkTTS } from './tts.js'
import { route, splitCommands } from './intent-router.js'
import { loadScene } from './templates.js'

let idCounter = 0
function uid() { return `vd_${Date.now()}_${idCounter++}` }

import { set as setAlias } from './canvas-memory.js'

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
  const tasks = plan.tasks || []
  if (!tasks.length) return 0

  const vp = editor.getViewportPageBounds()
  const startX = vp.x + 40
  let currentY = vp.y + 40
  let drawn = 0

  for (const task of tasks) {
    if (task.action !== 'create') continue

    const def = TYPE_MAP[task.type]
    if (!def) {
      editor.createShape({
        id: uid(), type: 'text', x: startX, y: currentY,
        props: { richText: [{ type: 'paragraph', content: [{ type: 'text', text: task.type || '?' }] }] },
      })
      currentY += 48
      drawn++
      continue
    }

    const id = uid()
    editor.createShape({
      id, type: 'geo', x: startX, y: currentY,
      props: { geo: 'rectangle', w: def.w, h: def.h, color: 'light-violet' },
    })

    if (def.label) {
      editor.createShape({
        id: uid(), type: 'text', x: startX + 8, y: currentY + 4,
        props: { richText: [{ type: 'paragraph', content: [{ type: 'text', text: def.label }] }] },
      })
    }

    if (task.alias) setAlias(task.alias, id, task.type)
    currentY += def.h + 16
    drawn++
  }

  return drawn
}

function setStatus(state) {
  const text = document.getElementById('status-text')
  const dot = document.getElementById('status-dot')
  if (!text || !dot) return
  const s = {
    idle: { text: '就绪', dotClass: 'dot-idle' },
    listening: { text: '正在听...', dotClass: 'dot-listening' },
    thinking: { text: '思考中...', dotClass: 'dot-thinking' },
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

  useEffect(() => { window.__editor = editor }, [editor])

  const executeCommand = useCallback(async (result) => {
    if (!result || result.cmd === 'noop' || result.cmd === 'unknown') return
    setStatus('drawing')
    const { cmd, args } = result
    try {
      const selected = editor.getSelectedShapes()
      const vp = editor.getViewportPageBounds()
      const cx = vp.x + vp.w / 2
      const cy = vp.y + vp.h / 2

      switch (cmd) {
        case 'create': {
          const geoMap = { circle: 'circle', rect: 'rectangle', triangle: 'triangle', diamond: 'diamond' }
          const geo = geoMap[args]
          if (geo) {
            editor.createShape({ id: uid(), type: 'geo', x: cx - 50, y: cy - 50, props: { geo, w: 100, h: 100 } })
          } else if (args && args.startsWith('label:')) {
            editor.createShape({ id: uid(), type: 'text', x: cx, y: cy, props: { richText: [{ type: 'paragraph', content: [{ type: 'text', text: args.replace('label:', '') }] }] } })
          } else if (TYPE_MAP[args]) {
            const def = TYPE_MAP[args]
            editor.createShape({ id: uid(), type: 'geo', x: cx - def.w / 2, y: cy, props: { geo: 'rectangle', w: def.w, h: def.h, color: 'light-violet' } })
          } else {
            editor.createShape({ id: uid(), type: args === 'arrow' ? 'arrow' : 'line', x: cx - 50, y: cy })
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
        case 'redo': editor.redo(); break
        case 'clear': editor.deleteShapes([...editor.getCurrentPageShapeIds()]); break
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
      setStatus('error'); setTimeout(() => setStatus('idle'), 2000)
    } finally { setStatus('idle') }
  }, [editor])

  const handleSpeech = useCallback(async () => {
    if (isListening.current) {
      stopListening(); isListening.current = false
      document.getElementById('mic-btn')?.classList.remove('listening'); setStatus('idle'); return
    }
    isListening.current = true
    document.getElementById('mic-btn')?.classList.add('listening'); setStatus('listening')
    startListening({
      onInterim: (t) => { const el = document.getElementById('status-text'); if (el) el.textContent = t || '正在听...' },
      onResult: async (text) => {
        setStatus('thinking'); stopListening(); isListening.current = false
        document.getElementById('mic-btn')?.classList.remove('listening')
        for (const c of splitCommands(text)) await executeCommand(await route(c))
      },
      onError: () => { setStatus('error'); isListening.current = false; document.getElementById('mic-btn')?.classList.remove('listening'); setTimeout(() => setStatus('idle'), 2000) },
    })
  }, [executeCommand])

  useEffect(() => {
    const btn = document.getElementById('mic-btn'); if (!btn) return
    btn.addEventListener('click', handleSpeech)
    const onKey = (e) => { if (e.key === ' ' && e.target === document.body) { e.preventDefault(); handleSpeech() } }
    document.addEventListener('keydown', onKey)
    return () => { btn.removeEventListener('click', handleSpeech); document.removeEventListener('keydown', onKey) }
  }, [handleSpeech])

  useEffect(() => { console.log('[VoiceDraw] STT:', checkSTT(), 'TTS:', checkTTS()); setStatus('idle') }, [])
  return null
}

function App() {
  return <div style={{ width: '100vw', height: '100vh' }}><Tldraw><VoiceDrawInner /></Tldraw></div>
}
createRoot(document.getElementById('app')).render(<App />)
