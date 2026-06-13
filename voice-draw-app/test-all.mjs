// VoiceDraw Agent — 全量功能测试
// 用法: node --import ./env-mock.mjs ./test-all.mjs

import { preprocess, matchL1, matchL2, matchL8 } from './src/rule-engine.js'
import { matchL3, splitCommands } from './src/intent-router.js'
import { layout } from './src/layout-engine.js'
import { set, get, remove, clear, snapshot, restore, list } from './src/canvas-memory.js'

let ok = 0, fail = 0
function t(name, cond) {
  if (cond) { ok++; console.log('  ✅', name) }
  else { fail++; console.log('  ❌', name) }
}

// ============================================================
// Step 0: 预处理
// ============================================================
console.log('━━━ Step 0 预处理 ━━━')
t('去噪 "嗯...画圆" → "画圆"', preprocess('嗯...画圆') === '画圆')
t('去噪 "那个画矩形" → "画矩形"', preprocess('那个画矩形') === '画矩形')
t('去噪空字符串 "嗯啊" → ""', preprocess('嗯啊') === '')
t('同音词 "话圆" → "画圆"', preprocess('话圆') === '画圆')
t('同音词 "洪色" → "红色"', preprocess('洪色') === '红色')
t('同音词 "蓝瑟" → "蓝色"', preprocess('蓝瑟') === '蓝色')
t('同音词 "巨型" → "矩形"', preprocess('巨型') === '矩形')
t('同音词 "三角行" → "三角形"', preprocess('三角行') === '三角形')
t('去颜色修饰 "红色的" → 移除', preprocess('画一个红色的圆') === '画一个圆')

// ============================================================
// L1: 正则匹配 (28条)
// ============================================================
console.log('\n━━━ L1 基本形状 ━━━')
t('"画圆" → create:circle', matchL1('画圆')?.args === 'circle')
t('"画一个圆" → create:circle', matchL1('画一个圆')?.args === 'circle')
t('"画矩形" → create:rect', matchL1('画矩形')?.args === 'rect')
t('"画一个方形" → create:rect', matchL1('画一个方形')?.args === 'rect')
t('"画三角形" → create:triangle', matchL1('画三角形')?.args === 'triangle')
t('"画线" → create:line', matchL1('画线')?.args === 'line')
t('"画一条线" → create:line', matchL1('画一条线')?.args === 'line')
t('"画箭头" → create:arrow', matchL1('画箭头')?.args === 'arrow')
t('"画文字" → create:text', matchL1('画文字')?.args === 'text')
t('"画菱形" → create:diamond', matchL1('画菱形')?.args === 'diamond')
t('"画圆形" → create:circle', matchL1('画圆形')?.args === 'circle')

console.log('\n━━━ L1 颜色修改 ━━━')
t('"涂成红色" → color:red', matchL1('涂成红色')?.args === 'red')
t('"涂成蓝色" → color:blue', matchL1('涂成蓝色')?.args === 'blue')
t('"改成绿色" → color:green', matchL1('改成绿色')?.args === 'green')
t('"填充黄色" → color:yellow', matchL1('填充黄色')?.args === 'yellow')
t('"设为黑色" → color:black', matchL1('设为黑色')?.args === 'black')
t('"变成白色" → color:white', matchL1('变成白色')?.args === 'white')
t('"改成紫色" → color:purple', matchL1('改成紫色')?.args === 'purple')
t('"涂成橙色" → color:orange', matchL1('涂成橙色')?.args === 'orange')
t('"设为灰色" → color:gray', matchL1('设为灰色')?.args === 'gray')

console.log('\n━━━ L1 缩放 + 移动 ━━━')
t('"放大" → scale:1.2', matchL1('放大')?.args === '1.2')
t('"缩小" → scale:0.8', matchL1('缩小')?.args === '0.8')
t('"变大一点" → scale:1.2', matchL1('变大一点')?.args === '1.2')
t('"变小一点" → scale:0.8', matchL1('变小一点')?.args === '0.8')
t('"移到左边" → move:left', matchL1('移到左边')?.args === 'left')
t('"移到右边" → move:right', matchL1('移到右边')?.args === 'right')
t('"移到中间" → move:center', matchL1('移到中间')?.args === 'center')
t('"移到顶部" → move:top', matchL1('移到顶部')?.args === 'top')
t('"移到底部" → move:bottom', matchL1('移到底部')?.args === 'bottom')

// ============================================================
// L2: 关键词匹配
// ============================================================
console.log('\n━━━ L2 关键词 ━━━')
t('"撤销" → undo', matchL2('撤销')?.cmd === 'undo')
t('"后退" → undo', matchL2('后退')?.cmd === 'undo')
t('"重做" → redo', matchL2('重做')?.cmd === 'redo')
t('"清空画布" → clear', matchL2('清空画布')?.cmd === 'clear')
t('"全部删除" → clear', matchL2('全部删除')?.cmd === 'clear')
t('"分组" → group', matchL2('分组')?.cmd === 'group')
t('"组合" → group', matchL2('组合')?.cmd === 'group')
t('"取消分组" → ungroup', matchL2('取消分组')?.cmd === 'ungroup')
t('"解散" → ungroup', matchL2('解散')?.cmd === 'ungroup')
t('"解组" → ungroup', matchL2('解组')?.cmd === 'ungroup')
t('"删除" → delete', matchL2('删除')?.cmd === 'delete')
t('"全选" → selectAll', matchL2('全选')?.cmd === 'selectAll')
t('"选择全部" → selectAll', matchL2('选择全部')?.cmd === 'selectAll')
t('"保存" → save', matchL2('保存')?.cmd === 'save')
t('"导出" → export', matchL2('导出')?.cmd === 'export')

// ============================================================
// L3: 模板匹配 (导入自 intent-router)
// ============================================================
console.log('\n━━━ L3 模板 ━━━')
t('"画登录页" → template:login-page', matchL3('画登录页')?.args === 'login-page')
t('"画架构图" → template:system-arch', matchL3('画架构图')?.args === 'system-arch')
t('"画ER图" → template:er-diagram', matchL3('画ER图')?.args === 'er-diagram')
t('"画流程图" → template:flowchart', matchL3('画流程图')?.args === 'flowchart')
t('"画仪表盘" → template:dashboard', matchL3('画仪表盘')?.args === 'dashboard')
t('"画思维导图" → template:mindmap', matchL3('画思维导图')?.args === 'mindmap')
t('"数据库设计" → template:er-diagram', matchL3('数据库设计')?.args === 'er-diagram')
t('"登录" → template:login-page', matchL3('登录')?.args === 'login-page')
t('"注册" → template:login-page', matchL3('注册')?.args === 'login-page')
t('"系统架构" → template:system-arch', matchL3('系统架构')?.args === 'system-arch')
t('"脑图" → template:mindmap', matchL3('脑图')?.args === 'mindmap')
t('无匹配 → null', matchL3('今天天气不错') === null)

// ============================================================
// L8: 降级
// ============================================================
console.log('\n━━━ L8 降级 ━━━')
t('"仪表盘" → template:dashboard', matchL8('仪表盘')?.args === 'dashboard')
t('"登录" → template:login-page', matchL8('登录')?.args === 'login-page')
t('"架构图" → template:system-arch', matchL8('架构图')?.args === 'system-arch')
t('"流程图" → template:flowchart', matchL8('流程图')?.args === 'flowchart')
t('"思维导图" → template:mindmap', matchL8('思维导图')?.args === 'mindmap')
t('"ER图" → template:er-diagram', matchL8('ER图')?.args === 'er-diagram')
t('"卡片" → create:card-grid', matchL8('卡片')?.args === 'card-grid')
t('"表格" → create:table', matchL8('表格')?.args === 'table')
t('"侧边栏" → create:sidebar', matchL8('侧边栏')?.args === 'sidebar')
t('"导航栏" → create:navbar', matchL8('导航栏')?.args === 'navbar')
t('"顶部导航" → create:navbar', matchL8('顶部导航')?.args === 'navbar')
t('"搜索" → create:search-bar', matchL8('搜索')?.args === 'search-bar')
t('"按钮" → create:button', matchL8('按钮')?.args === 'button')
t('"表单" → create:form', matchL8('表单')?.args === 'form')
t('"输入框" → create:input', matchL8('输入框')?.args === 'input')
t('"页脚" → create:footer', matchL8('页脚')?.args === 'footer')
t('未知→文本兜底 "画小猫" → label:小猫', matchL8('画小猫')?.args === 'label:小猫')
t('无匹配 → null', matchL8('今天天气不错') === null)
t('"导航栏"不误匹配sidebar', matchL8('导航栏')?.args !== 'sidebar')

// ============================================================
// 连续指令切分 (导入自 intent-router)
// ============================================================
console.log('\n━━━ 连续指令切分 ━━━')
t('标点切分 "画圆，放大，移到左边" → 3句', splitCommands('画圆，放大，移到左边').length === 3)
t('逗号切分 "画圆,涂成红色" → 2句', splitCommands('画圆,涂成红色').length === 2)
t('连词切分 "画圆然后放大" → 2句', splitCommands('画圆然后放大').length === 2)
t('连词切分 "画圆接着删掉" → 2句', splitCommands('画圆接着删掉').length === 2)
t('连词切分 "画圆之后再画矩形" → 2句', splitCommands('画圆之后再画矩形').length === 2)
t('单指令 "画圆" → 1句', splitCommands('画圆').length === 1)
t('空字符串 → 1句', splitCommands('').length === 1)
t('动词切分 "画圆删除三角形" → 2句', splitCommands('画圆删除三角形').length === 2)

// ============================================================
// Layout Engine
// ============================================================
console.log('\n━━━ Layout Engine ━━━')
const CANVAS = { w: 1200, h: 800 }
const tasks1 = [{ type: 'navbar', alias: 'nav' }]
const r1 = layout('centered', tasks1, CANVAS)
t('centered navbar 居中', r1[0].x === (1200 - 800) / 2 && r1[0].y === 40)

const tasks2 = [{ type: 'sidebar', alias: 'side' }, { type: 'card-grid', alias: 'cards' }]
const r2 = layout('sidebar-left', tasks2, CANVAS)
t('sidebar-left sidebar 在左侧', r2[0].x === 40 && r2[0].w === 200)
t('sidebar-left card-grid 在右侧', r2[1].x === 40 + 200 + 16)

const tasks3 = [{ type: 'card', alias: 'c1' }, { type: 'card', alias: 'c2' }, { type: 'card', alias: 'c3' }, { type: 'card', alias: 'c4' }]
const r3 = layout('grid', tasks3, CANVAS)
t('grid 4卡片分2列', r3[0].x !== r3[1].x && r3[0].y === r3[1].y && r3[2].y !== r3[0].y)
t('grid 不越界', r3.every(p => p.x >= 0 && p.y >= 0 && p.x + p.w <= CANVAS.w))

const tasks4 = [{ type: 'hero-section' }, { type: 'footer' }]
const r4 = layout('top-down', tasks4, CANVAS)
t('top-down 竖排', r4[0].y === 40 && r4[1].y > r4[0].y)
t('top-down 不越界', r4.every(p => p.x + p.w <= CANVAS.w))

t('空 tasks → []', layout('centered', [], CANVAS).length === 0)
t('未知 hint → centered 兜底', layout('unknown', tasks1, CANVAS)[0].x === (1200 - 800) / 2)

// ============================================================
// Canvas Memory
// ============================================================
console.log('\n━━━ Canvas Memory ━━━')
clear()
t('空 Map size=0', list().length === 0)

set('红色按钮', 'shape_001', 'button')
t('set 后 get 正确', get('红色按钮')?.shapeId === 'shape_001')
t('set 后 type 正确', get('红色按钮')?.type === 'button')

set('侧边栏', 'shape_002', 'sidebar')
t('list 返回2条', list().length === 2)

remove('红色按钮')
t('remove 后 get 返回 null', get('红色按钮') === null)
t('remove 后 list 返回1条', list().length === 1)

const snap = snapshot()
t('snapshot 返回 Array', Array.isArray(snap) && snap.length === 1)

clear()
t('clear 后 size=0', list().length === 0)

// 兼容 Array 格式
restore([['蓝色框', { shapeId: 'shape_003', type: 'rect' }]])
t('restore Array 格式', get('蓝色框')?.shapeId === 'shape_003')

// 兼容 Object 格式
restore({ '绿色卡片': { shapeId: 'shape_004', type: 'card' } })
t('restore Object 格式', get('绿色卡片')?.shapeId === 'shape_004')

// 空值容错
restore(null)
t('restore null 不报错', list().length === 0)

restore(undefined)
t('restore undefined 不报错', list().length === 0)

restore([['', null], ['valid', { shapeId: 'ok' }]])
t('restore 跳过无效条目', get('valid')?.shapeId === 'ok')

clear()

// ============================================================
// 边界测试
// ============================================================
console.log('\n━━━ 边界测试 ━━━')
t('空字符串 → null', matchL1('') === null)
t('无关文本 → null', matchL1('今天天气不错') === null)
t('"清空" → clear (不是group)', matchL2('清空')?.cmd === 'clear')
t('"取消分组" → ungroup (不是group)', matchL2('取消分组')?.cmd === 'ungroup')
t('"前进" → redo (不是unused)', matchL2('前进')?.cmd === 'redo')
t('"解组" → ungroup (不是group)', matchL2('解组')?.cmd === 'ungroup')

console.log('  ⚠️ "画一个红色的圆" L1直接匹配:', matchL1('画一个红色的圆')
  ? '命中' : '未命中（预期-需先preprocess）')
console.log('  ⚠️ preprocess后匹配:', matchL1(preprocess('画一个红色的圆'))
  ? '命中→create:circle' : '未命中')

// ============================================================
// 报告
// ============================================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`通过 ${ok} / ${ok + fail}`)
if (fail) {
  console.log(`❌ ${fail} 项失败`)
  process.exit(1)
} else {
  console.log('✅ 全部通过')
}
