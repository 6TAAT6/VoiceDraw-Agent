// ============================================================
// VoiceDraw Agent — 五阶段状态机
// Listening → Thinking → Confirming/Clarifying → Drawing → Speaking → Listening
// ============================================================

const STATES = ['idle', 'listening', 'thinking', 'confirming', 'clarifying', 'drawing', 'speaking']

let current = 'idle'
let listeners = []
let confirmCallback = null
let clarifications = []

export function getState() {
  return current
}

export function onChange(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function transition(to, payload) {
  if (to === current) return
  current = to
  listeners.forEach(fn => fn(to, payload))
}

// ====== 转换入口 ======

export function toListening() {
  transition('listening')
}

export function toThinking() {
  transition('thinking')
}

export function toDrawing() {
  transition('drawing')
}

export function toSpeaking() {
  transition('speaking')
}

export function toIdle() {
  confirmCallback = null
  clarifications = []
  transition('idle')
}

// ====== 确认（高危操作） ======

export function confirm(message, onConfirm) {
  confirmCallback = onConfirm
  transition('confirming', { message })
}

export function resolveConfirm(yes) {
  if (!confirmCallback) return
  if (yes) confirmCallback()
  confirmCallback = null
  transition('idle')
}

export function hasPendingConfirm() {
  return !!confirmCallback
}

// ====== 澄清（多候选） ======

export function clarify(options) {
  clarifications = options || []
  transition('clarifying', { options })
}

export function getClarifications() {
  return clarifications
}

export function resolveClarify(index) {
  clarifications = []
  transition('idle')
  return clarifications[index]
}
