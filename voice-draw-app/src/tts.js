// ============================================================
// VoiceDraw Agent — 语音合成模块
// 主力: SpeechSynthesis | 备用: 七牛云 TTS (未实现)
// ============================================================

const synth = window.speechSynthesis
const isSupported = !!synth

/** 中文语音缓存 */
let zhVoice = null

function getZhVoice() {
  if (zhVoice) return zhVoice
  const voices = synth.getVoices()
  // 优先找简体中文女声
  zhVoice = voices.find(v => v.lang.startsWith('zh-CN') && v.name.includes('Female'))
    || voices.find(v => v.lang.startsWith('zh-CN'))
    || voices.find(v => v.lang.startsWith('zh'))
    || voices[0]
  return zhVoice
}

// 浏览器可能异步加载 voice 列表
if (isSupported) {
  synth.onvoiceschanged = () => { zhVoice = null }
}

/**
 * 语音播报（异步，不阻塞主流程）
 * @param {string} text   播报文本
 * @param {Object} options
 * @param {number} options.rate    语速 (0.5-2, 默认 1)
 * @param {number} options.pitch   音调 (0-2, 默认 1)
 * @returns {Promise<void>}
 */
export function speak(text, { rate = 1, pitch = 1 } = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupported) {
      console.warn('[TTS] SpeechSynthesis 不可用，跳过播报:', text)
      resolve() // 软降级，不抛错
      return
    }

    // 取消当前正在播报的内容（防止排队堆积）
    synth.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = rate
    utterance.pitch = pitch
    utterance.voice = getZhVoice()

    utterance.onend = () => resolve()
    utterance.onerror = (err) => {
      console.warn('[TTS] 播报失败:', err)
      resolve() // 软降级
    }

    synth.speak(utterance)
  })
}

/**
 * 检查 TTS 是否可用
 */
export function checkSupport() {
  return isSupported
}
