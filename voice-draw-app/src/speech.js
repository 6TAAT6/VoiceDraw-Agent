// ============================================================
// VoiceDraw Agent — 语音识别
// 主力: 七牛云 ASR WebSocket  |  备用: Web Speech API
// ============================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

// ====== Web Speech (fallback) ======

let webSpeechReco = null

function checkWebSpeech() {
  return !!SpeechRecognition
}

function startWebSpeech({ onResult, onInterim, onError, onStart, onEnd }) {
  if (!webSpeechReco) {
    webSpeechReco = new SpeechRecognition()
    webSpeechReco.lang = 'zh-CN'
    webSpeechReco.interimResults = true
    webSpeechReco.continuous = false
    webSpeechReco.maxAlternatives = 1
  }

  webSpeechReco.onstart = () => onStart?.()
  webSpeechReco.onresult = (event) => {
    let interim = '', final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        if (event.results[i][0].confidence < 0.6) {
          onError?.(new Error('置信度过低'))
          return
        }
        final += t
      } else { interim += t }
    }
    if (final) onResult?.(final.trim())
    if (interim) onInterim?.(interim.trim())
  }
  webSpeechReco.onerror = (event) => {
    const msg = {
      'no-speech': '未检测到语音',
      'audio-capture': '麦克风未找到',
      'not-allowed': '麦克风权限被拒绝',
      'network': '网络错误',
    }[event.error] || event.error
    onError?.(new Error(msg))
  }
  webSpeechReco.onend = () => onEnd?.()

  try { webSpeechReco.start() } catch (err) { onError?.(err) }
}

function stopWebSpeech() {
  if (webSpeechReco) { try { webSpeechReco.stop() } catch (_) {} }
}

// ====== 七牛云 ASR WebSocket (主力) ======

let asrWs = null
let audioCtx = null
let scriptNode = null
let micStream = null
let asrActive = false

async function startQiniuASR({ onResult, onInterim, onError, onStart, onEnd }) {
  // 1) 获取 token
  const tokenResp = await fetch('/api/asr/token')
  const tokenData = await tokenResp.json()
  if (!tokenData.available) throw new Error(tokenData.reason || 'ASR 不可用')

  // 2) 建立 WebSocket
  const wsUrl = `${tokenData.url}?token=${encodeURIComponent(tokenData.token)}`
  asrWs = new WebSocket(wsUrl)

  await new Promise((resolve, reject) => {
    asrWs.onopen = resolve
    asrWs.onerror = () => reject(new Error('ASR 连接失败'))
    setTimeout(() => reject(new Error('ASR 连接超时')), 5000)
  })

  // 3) 发送开始指令
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

  // 4) 打开麦克风，PCM 流送
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

  // 5) 静音 3 秒自动停止
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

// ====== 统一接口 ======

let activeEngine = null

export function checkSupport() {
  return !!(navigator.mediaDevices?.getUserMedia) || checkWebSpeech()
}

export async function startListening(callbacks = {}) {
  try {
    await startQiniuASR(callbacks)
    activeEngine = 'qiniu'
    return
  } catch (err) {
    console.warn('[Speech] 七牛 ASR 不可用，降级 Web Speech:', err.message)
    stopQiniuASR()
  }

  if (checkWebSpeech()) {
    startWebSpeech(callbacks)
    activeEngine = 'webspeech'
    return
  }
  callbacks.onError?.(new Error('语音识别不可用'))
}

export function stopListening() {
  if (activeEngine === 'qiniu') stopQiniuASR()
  else if (activeEngine === 'webspeech') stopWebSpeech()
  activeEngine = null
}

export function destroy() {
  stopListening()
  webSpeechReco = null
}
