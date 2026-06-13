// ============================================================
// VoiceDraw Agent — 语音识别 (MediaRecorder + 七牛云 ASR)
// 支持静音自动停止 + 手动点击停止
// ============================================================

let mediaRecorder = null
let audioChunks = []
let silenceTimer = null
let audioCtx = null
let analyser = null
let silenceStart = null

const SILENCE_DURATION = 1800  // 连续静音 1.8s 自动停止

/**
 * 启动录音 → 发送到七牛云 ASR
 * 内置静音检测：连续静音 SILENCE_DURATION ms 后自动停止
 */
async function startRecording({ onResult, onInterim, onError, onStart, onEnd }) {
  // 检查 ASR 可用性
  try {
    const resp = await fetch('/api/asr/token')
    const data = await resp.json()
    if (!data.available) throw new Error('ASR 不可用')
  } catch (e) {
    throw new Error('ASR 服务未连接')
  }

  // 打开麦克风
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

  // ========== 静音检测（Web Audio API）==========
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
  } catch (_) { /* 静音检测不是必需，降级为手动停止 */ }

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'

  mediaRecorder = new MediaRecorder(stream, { mimeType })
  audioChunks = []
  silenceStart = null

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data)
  }

  mediaRecorder.onstart = () => onStart?.()

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop())
    clearTimeout(silenceTimer)
    silenceTimer = null
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; analyser = null }

    if (!audioChunks.length) {
      onResult?.('')
      onEnd?.()
      return
    }

    const blob = new Blob(audioChunks, { type: 'audio/webm' })

    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')

      const resp = await fetch('/api/asr/recognize', {
        method: 'POST',
        body: formData,
      })
      const data = await resp.json()

      if (data.text) {
        onResult?.(data.text)
      } else {
        const msg = data.error || '未识别到语音'
        onError?.(new Error(msg))
      }
    } catch (err) {
      onError?.(err)
    }
    onEnd?.()
  }

  // ========== 静音检测循环 ==========
  const checkSilence = () => {
    if (!analyser || mediaRecorder.state !== 'recording') return
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

    if (avg < 10) { // 静音阈值
      if (!silenceStart) silenceStart = Date.now()
      else if (Date.now() - silenceStart > SILENCE_DURATION) {
        // 连续静音超时，自动停止
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
        return
      }
    } else {
      silenceStart = null
    }

    silenceTimer = setTimeout(checkSilence, 150)
  }

  // 开始录音
  mediaRecorder.start(250) // 每 250ms 输出一个 chunk
  if (analyser) silenceTimer = setTimeout(checkSilence, 300) // 给一点初始化时间
}

export function checkSupport() {
  try {
    return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
  } catch {
    return false
  }
}

export async function startListening(callbacks = {}) {
  try {
    await startRecording(callbacks)
  } catch (err) {
    callbacks.onError?.(err)
  }
}

export function stopListening() {
  clearTimeout(silenceTimer)
  silenceTimer = null
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop()
  }
}

export function destroy() {
  stopListening()
  mediaRecorder = null
}
