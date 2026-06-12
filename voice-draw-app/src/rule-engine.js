// ============================================================
// VoiceDraw Agent — 规则引擎
// Step 0 预处理 + L1 正则匹配 + L2 关键词匹配 + L8 降级
// ============================================================

// ========== Step 0: 预处理 ==========

const FILLERS = /嗯|啊|那个|就是|这个|然后呢|那个啥|额|呃/g

const HOMOPHONE_MAP = {
  '话圆': '画圆',
  '话巨型': '画矩形',
  '话矩形': '画矩形',
  '巨型': '矩形',
  '三角行': '三角形',
  '洪色': '红色',
  '滤色': '绿色',
  '蓝瑟': '蓝色',
  '皇色': '黄色',
}

export function preprocess(text) {
  let cleaned = text.trim()
  cleaned = cleaned.replace(FILLERS, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  for (const [wrong, correct] of Object.entries(HOMOPHONE_MAP)) {
    if (cleaned.includes(wrong)) cleaned = cleaned.replace(wrong, correct)
  }
  return cleaned
}

// ========== L1: 预编译正则匹配 ==========

const L1_RULES = [
  { pattern: /画(一?个)?圆[形]?/, handler: 'create:circle' },
  { pattern: /画(一?个)?(矩|方)形/, handler: 'create:rect' },
  { pattern: /画(一?个)?三角[形]?/, handler: 'create:triangle' },
  { pattern: /画(一?[条根]?)(直)?线/, handler: 'create:line' },
  { pattern: /画(一?[个根]?)箭(头|頭)/, handler: 'create:arrow' },
  { pattern: /画(一?[个段]?)文字/, handler: 'create:text' },
  { pattern: /画(一?个)?菱形/, handler: 'create:diamond' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(红[色]?)/, handler: 'color:red' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(蓝[色]?)/, handler: 'color:blue' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(绿[色]?)/, handler: 'color:green' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(黄[色]?)/, handler: 'color:yellow' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(黑[色]?)/, handler: 'color:black' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(白[色]?)/, handler: 'color:white' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(紫[色]?)/, handler: 'color:purple' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(橙[色]?|橘[色]?)/, handler: 'color:orange' },
  { pattern: /(?:改成?|涂成?|填充|设为|变成)\s*(灰[色]?)/, handler: 'color:gray' },
  { pattern: /(放大|变大|大一[点些])/, handler: 'scale:1.2' },
  { pattern: /(缩小|变小|小一[点些])/, handler: 'scale:0.8' },
  { pattern: /移[到]?(左边|左[侧]?)/, handler: 'move:left' },
  { pattern: /移[到]?(右边|右[侧]?)/, handler: 'move:right' },
  { pattern: /移[到]?(中间|中央|中心)/, handler: 'move:center' },
  { pattern: /移[到]?(上边|上面|顶部)/, handler: 'move:top' },
  { pattern: /移[到]?(下边|下面|底部)/, handler: 'move:bottom' },
]

export function matchL1(text) {
  for (const { pattern, handler } of L1_RULES) {
    const match = text.match(pattern)
    if (match) {
      const [cmd, ...args] = handler.split(':')
      return { source: 'L1', cmd, args: args.length ? args.join(':') : null, raw: text }
    }
  }
  return null
}

// ========== L2: 关键词匹配 ==========

const L2_KEYWORDS = [
  { keys: ['撤销', '后退', '返回上一步'], cmd: 'undo' },
  { keys: ['重做', '前进', '恢复'], cmd: 'redo' },
  { keys: ['清空', '全部删除', '删除所有'], cmd: 'clear' },
  { keys: ['保存', '存储'], cmd: 'save' },
  { keys: ['导出', '下载'], cmd: 'export' },
  { keys: ['分组', '组合', '组成一组'], cmd: 'group' },
  { keys: ['取消分组', '解散', '解组'], cmd: 'ungroup' },
  { keys: ['删除'], cmd: 'delete' },
  { keys: ['复制', '拷贝'], cmd: 'copy' },
  { keys: ['粘贴'], cmd: 'paste' },
  { keys: ['全选', '选择全部'], cmd: 'selectAll' },
]

export function matchL2(text) {
  for (const { keys, cmd } of L2_KEYWORDS) {
    if (keys.some(k => text.includes(k))) {
      return { source: 'L2', cmd, args: null, raw: text }
    }
  }
  return null
}

// ========== L8: DeepSeek 降级映射 ==========

const L8_MAP = [
  { keys: ['仪表盘', 'dashboard'], template: 'dashboard' },
  { keys: ['登录', '注册', 'login'], template: 'login-page' },
  { keys: ['架构图', '系统架构'], template: 'system-arch' },
  { keys: ['流程图', 'flowchart'], template: 'flowchart' },
  { keys: ['思维导图', '脑图', 'mindmap'], template: 'mindmap' },
  { keys: ['ER图', '数据库'], template: 'er-diagram' },
  { keys: ['卡片', 'card'], fallback: 'create:card-grid' },
  { keys: ['表格', 'table'], fallback: 'create:table' },
  { keys: ['侧边栏', '导航'], fallback: 'create:sidebar' },
  { keys: ['搜索', 'search'], fallback: 'create:search-bar' },
]

export function matchL8(text) {
  for (const entry of L8_MAP) {
    if (entry.keys.some(k => text.includes(k))) {
      if (entry.template) return { source: 'L8', cmd: 'template', args: entry.template, raw: text }
      if (entry.fallback) {
        const [cmd, type] = entry.fallback.split(':')
        return { source: 'L8', cmd, args: type, raw: text }
      }
    }
  }
  const drawMatch = text.match(/画(?:一?个)?(.{1,6})/)
  if (drawMatch) return { source: 'L8', cmd: 'create', args: `label:${drawMatch[1]}`, raw: text }
  return null
}
