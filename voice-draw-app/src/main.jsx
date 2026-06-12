import React, { useCallback, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, useEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import { startListening, stopListening, checkSupport as checkSTT } from './speech.js'
import { speak, checkSupport as checkTTS } from './tts.js'
import { route, splitCommands } from './intent-router.js'

function setStatus(state) {
  const text = document.getElementById('status-text')
  const dot = document.getElementById('status-dot')
  if (!text || !dot) return
  const styles = {
    idle: { text: '就绪', dotClass: 'dot-idle' },
    listening: { text: '正在听...', dotClass: 'dot-listening' },
    thinking: { text: '思考中...', dotClass: 'dot-thinking' },
    drawing: { text: '绘制中...', dotClass: 'dot-thinking' },
    speaking: { text: '播报中...', dotClass: 'dot-speaking' },
    error: { text: '出错了', dotClass: 'dot-error' },
  }
  const s = styles[state] || styles.idle
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
      switch (cmd) {
        case 'create': {
          const shapes = { circle: 'circle', rect: 'rectangle', triangle: 'triangle', diamond: 'diamond' }
          const geo = shapes[args]
          if (geo) {
            const { x, y } = editor.getViewportScreenCenter()
            editor.createShape({ type: 'geo', x, y, props: { geo } })
          } else if (args && args.startsWith('label:')) {
            const { x, y } = editor.getViewportScreenCenter()
            editor.createShape({ type: 'text', x, y, props: { richText: [{ type: 'paragraph', content: [{ type: 'text', text: args.replace('label:', '') }] }] } })
          } else {
            const { x, y } = editor.getViewportScreenCenter()
            editor.createShape({ type: args === 'arrow' ? 'arrow' : 'line', x, y })
          }
          break
        }
        case 'color': {
          for (const shape of editor.getSelectedShapes()) {
            editor.updateShape({ id: shape.id, type: shape.type, props: { ...shape.props, color: args } })
          }
          break
        }
        case 'scale': {
          const factor = parseFloat(args)
          for (const shape of editor.getSelectedShapes()) {
            const p = shape.props
            const w = (p.w || 100) * factor; const h = (p.h || 100) * factor
            editor.updateShape({ id: shape.id, type: shape.type, x: shape.x - (w - (p.w || 100)) / 2, y: shape.y - (h - (p.h || 100)) / 2, props: { ...p, w, h } })
          }
          break
        }
        case 'move': {
          const vp = editor.getViewportScreenBounds()
          const cx = vp.x + vp.w / 2; const cy = vp.y + vp.h / 2
          const pos = { left: { x: vp.x + 80, y: 'keep' }, right: { x: vp.x + vp.w - 200, y: 'keep' }, center: { x: cx - 50, y: cy - 50 }, top: { x: 'keep', y: vp.y + 80 }, bottom: { x: 'keep', y: vp.y + vp.h - 200 } }[args]
          if (!pos) break
          for (const shape of editor.getSelectedShapes()) {
            editor.updateShape({ id: shape.id, type: shape.type, x: pos.x === 'keep' ? shape.x : pos.x, y: pos.y === 'keep' ? shape.y : pos.y })
          }
          break
        }
        case 'undo': editor.undo(); break
        case 'redo': editor.redo(); break
        case 'clear': editor.deleteShapes([...editor.getCurrentPageShapeIds()]); break
        case 'delete': editor.deleteShapes([...editor.getSelectedShapeIds()]); break
        case 'group': editor.groupShapes([...editor.getSelectedShapeIds()]); break
        case 'ungroup': editor.ungroupShapes([...editor.getSelectedShapeIds()]); break
        case 'selectAll': editor.selectAll(); break
        case 'template': case 'plan': speak('收到，正在绘制').catch(() => {}); break
      }
      speak(cmd === 'create' ? '画好了' : '').catch(() => {})
    } catch (err) {
      console.error('[VoiceDraw] 执行失败:', err)
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
      onInterim: (text) => { const el = document.getElementById('status-text'); if (el) el.textContent = text || '正在听...' },
      onResult: async (text) => {
        setStatus('thinking'); stopListening(); isListening.current = false
        document.getElementById('mic-btn')?.classList.remove('listening')
        for (const cmdText of splitCommands(text)) await executeCommand(await route(cmdText))
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
