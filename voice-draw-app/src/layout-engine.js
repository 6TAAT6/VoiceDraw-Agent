// ============================================================
// VoiceDraw Agent — Layout Engine (4 种布局策略)
// 纯数学坐标计算，不碰 tldraw API
// ============================================================

const PAD = 40    // 画布边距
const GAP = 16    // 组件间距

/**
 * @param {string} hint  — sidebar-left | centered | top-down | grid
 * @param {Array}  tasks — [{ type, alias, ... }]
 * @param {{ w: number, h: number }} canvas — 画布尺寸
 * @returns {Array} [{ type, alias, x, y, w, h }]
 */
export function layout(hint, tasks, canvas) {
  // 默认 centered 兜底
  if (!tasks || !tasks.length) return []
  const fn = { 'sidebar-left': sidebarLeft, centered: centered, 'top-down': topDown, grid: gridLayout }[hint] || centered
  return fn(tasks, canvas)
}

// ========== sidebar-left ==========
function sidebarLeft(tasks, c) {
  const out = []
  let navY = PAD
  let rightY = PAD
  let hasNavbar = false

  // 找 navbar 放顶部
  const navbar = tasks.find(t => t.type === 'navbar')
  if (navbar) {
    out.push({ ...navbar, x: PAD, y: navY, w: c.w - PAD * 2, h: 48 })
    navY += 48 + GAP
    rightY = navY
    hasNavbar = true
  }

  // sidebar 放左侧
  const sidebar = tasks.find(t => t.type === 'sidebar')
  if (sidebar) {
    out.push({ ...sidebar, x: PAD, y: navY, w: 200, h: 400 })
  }

  const rightX = PAD + 200 + GAP
  const rightW = c.w - rightX - PAD

  // 其余组件放右侧竖排
  for (const t of tasks) {
    if (t === navbar || t === sidebar) continue
    const dim = dimFor(t.type)
    out.push({ ...t, x: rightX, y: rightY, w: Math.min(dim.w, rightW), h: dim.h })
    rightY += dim.h + GAP
  }

  return out
}

// ========== centered ==========
function centered(tasks, c) {
  let y = PAD
  const out = []
  for (const t of tasks) {
    const dim = dimFor(t.type)
    out.push({ ...t, x: (c.w - dim.w) / 2, y, w: dim.w, h: dim.h })
    y += dim.h + GAP
  }
  return out
}

// ========== top-down ==========
function topDown(tasks, c) {
  let y = PAD
  const out = []
  for (const t of tasks) {
    const dim = dimFor(t.type)
    out.push({ ...t, x: PAD, y, w: Math.min(dim.w, c.w - PAD * 2), h: dim.h })
    y += dim.h + GAP
  }
  return out
}

// ========== grid ==========
function gridLayout(tasks, c) {
  const cols = Math.ceil(Math.sqrt(tasks.length))
  const cellW = (c.w - PAD * 2 - GAP * (cols - 1)) / cols
  const out = []
  for (let i = 0; i < tasks.length; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const dim = dimFor(tasks[i].type)
    out.push({
      ...tasks[i],
      x: PAD + col * (cellW + GAP),
      y: PAD + row * (dim.h + GAP),
      w: cellW,
      h: dim.h,
    })
  }
  return out
}

// ========== 默认尺寸表 ==========
function dimFor(type) {
  const dims = {
    navbar:     { w: 800, h: 48 },
    sidebar:    { w: 200, h: 400 },
    'card-grid':{ w: 400, h: 280 },
    card:       { w: 160, h: 100 },
    button:     { w: 100, h: 36 },
    input:      { w: 200, h: 32 },
    table:      { w: 400, h: 200 },
    'chart-area':{ w: 300, h: 200 },
    'hero-section':{ w: 500, h: 200 },
    footer:     { w: 800, h: 40 },
    'search-bar':{ w: 240, h: 32 },
    form:       { w: 300, h: 240 },
    text:       { w: 120, h: 32 },
  }
  return dims[type] || { w: 120, h: 32 }
}
