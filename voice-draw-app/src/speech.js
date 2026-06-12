// ============================================================
// VoiceDraw Agent — 语音识别模块
// 主力: Web Speech API | 备用: 七牛云 ASR (未实现)
// ============================================================

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

let recognition = null
let isSupported = !!SpeechRecognition

// 连续错误计数器 (用于触达 fallback)
let consecutiveErrors = 0
const ERROR_THRESHOLD = 3

/**
 * 检查浏览器是否支持语音识别
 */
export function checkSupport() {
  return isSupported
}

/**
 * 开始语音监听
 * @param {Object} callbacks
 * @param {function} callbacks.onResult    — 最终识别文本 (string)
 * @param {function} callbacks.onInterim   — 实时临时文本 (string)
 * @param {function} callbacks.onError     — 错误 (Error)
 * @param {function} callbacks.onStart     — 开始拾音
 * @param {function} callbacks.onEnd       — 停止拾音
 */
export function startListening({ onResult, onInterim, onError, onStart, onEnd } = {}) {
  if (!isSupported) {
    onError?.(new Error('Web Speech API 不可用'))
    return
  }

  // 复用实例避免重复创建
  if (!recognition) {
    recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = true
    recognition.continuous = false  // 单句模式，静音自动结束
    recognition.maxAlternatives = 1
  }

  recognition.onstart = () => {
    consecutiveErrors = 0
    onStart?.()
  }

  recognition.onresult = (event) => {
    let interim = ''
    let final = ''

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
      const confidence = event.results[i][0].confidence

      if (event.results[i].isFinal) {
        // 置信度检查 (L2 容错)
        if (confidence < 0.6) {
          onError?.(new Error('置信度过低，请再说一次'))
          return
        }
        final += transcript
      } else {
        interim += transcript
      }
    }

    if (final) onResult?.(final.trim())
    if (interim) onInterim?.(interim.trim())
  }

  recognition.onerror = (event) => {
    consecutiveErrors++
    const msg = {
      'no-speech': '未检测到语音',
      'audio-capture': '麦克风未找到',
      'not-allowed': '麦克风权限被拒绝',
      'network': '网络错误',
    }[event.error] || event.error

    onError?.(new Error(`[${event.error}] ${msg}`))

    // 连续错误超阈值 → 建议切换 fallback
    if (consecutiveErrors >= ERROR_THRESHOLD) {
      onError?.(new Error('Web Speech 连续失败，建议切换七牛云 ASR'))
    }
  }

  recognition.onend = () => {
    onEnd?.()
  }

  try {
    recognition.start()
  } catch (err) {
    onError?.(err)
  }
}

/**
 * 手动停止监听
 */
export function stopListening() {
  if (recognition) {
    try { recognition.stop() } catch (_) { /* 忽略未启动时的 stop 异常 */ }
  }
}

/**
 * 销毁 recognition 实例
 */
export function destroy() {
  stopListening()
  recognition = null
}
