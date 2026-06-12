// ============================================================
// VoiceDraw Agent — 语音识别 (七牛云 ASR WebSocket)
// ============================================================

let asrWs = null
let audioCtx = null
let scriptNode = null
let micStream = null
let asrActive = false

async function startQiniuASR({ onResult, onInterim, onError, onStart, onEnd }) {
  const tokenResp = await fetch('/api/asr/token')
  const tokenData = await tokenResp.json()
  if (!tokenData.available) throw new Error(tokenData.reason || 'ASR 不可用')

  const wsUrl = `${tokenData.url}?token=${encodeURIComponent(tokenData.token)}`
  asrWs = new WebSocket(wsUrl)

  await new Promise((resolve, reject) => {
    asrWs.onopen = resolve
    asrWs.onerror = () => reject(new Error('ASR 连接失败'))
    setTimeout(() => reject(new Error('ASR 连接超时')), 5000)
  })

  asrWs.send(JSON.stringify({
    cmd: 'start',
    params: { audio_format: 'pcm', sample_rate: 16000, channels: 1, bits_per_sample: 16 },
  }))

  let interimText = ''

  asrWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'final' && msg.text) {
        interimText = ''
        onResult?.(msg.text.trim())
      } else if (msg.type === 'interim' && msg.text) {
        interimText = msg.text
        onInterim?.(interimText)
      } else if (msg.type === 'error') {
        onError?.(new Error(msg.message || 'ASR 错误'))
      }
    } catch (_) {}
  }

  asrWs.onerror = () => onError?.(new Error('ASR 异常'))
  asrWs.onclose = () => {
    if (asrActive && interimText) onResult?.(interimText.trim())
    asrActive = false
    onEnd?.()
  }

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const source = audioCtx.createMediaStreamSource(micStream)
  scriptNode = audioCtx.createScriptProcessor(4096, 1, 1)

  scriptNode.onaudioprocess = (event) => {
    if (!asrActive || !asrWs || asrWs.readyState !== WebSocket.OPEN) return
    const input = event.inputBuffer.getChannelData(0)
    const pcm = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    asrWs.send(pcm.buffer)
  }

  source.connect(scriptNode)
  const gainNode = audioCtx.createGain()
  gainNode.gain.value = 0
  scriptNode.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  asrActive = true
  onStart?.()

  let silenceTimer
  const resetSilence = () => {
    clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => { if (asrActive) stopQiniuASR() }, 3000)
  }
  const origOnMsg = asrWs.onmessage
  asrWs.onmessage = (event) => { resetSilence(); origOnMsg?.(event) }
  resetSilence()
}

function stopQiniuASR() {
  asrActive = false
  try {
    if (asrWs && asrWs.readyState === WebSocket.OPEN) {
      asrWs.send(JSON.stringify({ cmd: 'stop' }))
      asrWs.close()
    }
  } catch (_) {}
  try { scriptNode?.disconnect() } catch (_) {}
  try { audioCtx?.close() } catch (_) {}
  try { micStream?.getTracks().forEach(t => t.stop()) } catch (_) {}
  asrWs = null; audioCtx = null; scriptNode = null; micStream = null
}

export function checkSupport() {
  return !!navigator.mediaDevices?.getUserMedia
}

export async function startListening(callbacks = {}) {
  try {
    await startQiniuASR(callbacks)
  } catch (err) {
    console.warn('[Speech]', err.message)
    callbacks.onError?.(err)
  }
}

export function stopListening() {
  stopQiniuASR()
}

export function destroy() {
  stopListening()
}
