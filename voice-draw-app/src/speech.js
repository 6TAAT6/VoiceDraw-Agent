// ============================================================
// VoiceDraw Agent — 语音识别 (AudioContext → Int16 PCM → 讯飞 ASR)
// 采集原始 16kHz 单声道 Int16 PCM，后端转发到讯飞实时语音转写大模型。
// ============================================================

let audioCtx = null
let stream = null
let source = null
let processor = null
let chunks = []       // Int16Array[]
let recording = false
let callbacks = null

export function checkSupport() {
  const hasMic = !!(navigator.mediaDevices?.getUserMedia)
  const hasAC = !!(window.AudioContext || window.webkitAudioContext)
  console.log('[Speech] Mic:', hasMic, 'AudioContext:', hasAC)
  return hasMic && hasAC
}

export async function startListening(cbs = {}) {
  if (recording) {
    console.warn('[Speech] Already recording')
    return
  }
  callbacks = cbs

  try {
    // 1. 获取麦克风（让浏览器自己决定采样率，后面重采样）
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    console.log('[Speech] 麦克风已打开, tracks:', stream.getAudioTracks().length)

    // 2. 创建 AudioContext
    const AC = window.AudioContext || window.webkitAudioContext
    audioCtx = new AC()
    console.log('[Speech] AudioContext sampleRate:', audioCtx.sampleRate)

    // 如果采样率不是 16000，需要重采样
    const needResample = audioCtx.sampleRate !== 16000

    source = audioCtx.createMediaStreamSource(stream)

    // 3. ScriptProcessor 回调
    processor = audioCtx.createScriptProcessor(4096, 1, 1)
    chunks = []

    processor.onaudioprocess = (event) => {
      let input = event.inputBuffer.getChannelData(0)
      const inRate = audioCtx.sampleRate

      // 重采样到 16000（简单线性插值）
      if (needResample && inRate !== 16000) {
        const ratio = inRate / 16000
        const outLen = Math.floor(input.length / ratio)
        const out = new Float32Array(outLen)
        for (let i = 0; i < outLen; i++) {
          const srcIdx = i * ratio
          const srcFloor = Math.floor(srcIdx)
          const srcCeil = Math.min(srcFloor + 1, input.length - 1)
          const frac = srcIdx - srcFloor
          out[i] = input[srcFloor] * (1 - frac) + input[srcCeil] * frac
        }
        input = out
      }

      // Float32 → Int16
      const int16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      chunks.push(int16)
    }

    source.connect(processor)
    processor.connect(audioCtx.destination)

    recording = true
    cbs.onStart?.()
    console.log('[Speech] 录音已开始')

  } catch (err) {
    callbacks = null
    console.error('[Speech] startListening error:', err)
    cbs.onError?.(err)
  }
}

export function stopListening() {
  if (!recording) return
  recording = false
  console.log('[Speech] 停止录音, chunks:', chunks.length)

  // 断开音频图
  try {
    if (processor) { processor.disconnect(); processor = null }
    if (source) { source.disconnect(); source = null }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
    if (audioCtx) { audioCtx.close(); audioCtx = null }
  } catch (e) { console.warn('[Speech] cleanup error:', e) }

  // 拼接 PCM
  const totalLen = chunks.reduce((s, c) => s + c.length, 0)
  if (totalLen === 0) {
    console.warn('[Speech] 无音频数据')
    callbacks?.onResult?.('')
    callbacks = null
    return
  }

  const merged = new Int16Array(totalLen)
  let off = 0
  for (const c of chunks) { merged.set(c, off); off += c.length }
  chunks = []

  const pcmBuf = merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength)
  console.log('[Speech] PCM 总长度:', pcmBuf.byteLength, 'bytes (', (pcmBuf.byteLength/32000).toFixed(1), 's)')

  _sendPCM(pcmBuf)
}

async function _sendPCM(arrayBuffer) {
  const cb = callbacks
  callbacks = null

  try {
    console.log('[Speech] 发送到后端...')
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' })
    const fd = new FormData()
    fd.append('audio', blob, 'recording.pcm')

    const resp = await fetch('/api/asr/recognize', { method: 'POST', body: fd })
    const data = await resp.json()
    console.log('[Speech] 后端响应:', data)

    if (data.text) {
      cb?.onResult?.(data.text)
    } else {
      cb?.onError?.(new Error(data.error || '未识别到语音'))
    }
  } catch (err) {
    console.error('[Speech] fetch error:', err)
    cb?.onError?.(err)
  }
}

export function destroy() {
  stopListening()
}
