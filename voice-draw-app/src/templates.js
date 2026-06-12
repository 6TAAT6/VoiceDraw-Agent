// ============================================================
// VoiceDraw Agent — 模板库 (6 场景 + 12 碎片)
// ============================================================

import dashboard from '../templates/scenes/dashboard.json'
import loginPage from '../templates/scenes/login-page.json'
import systemArch from '../templates/scenes/system-arch.json'
import erDiagram from '../templates/scenes/er-diagram.json'
import flowchart from '../templates/scenes/flowchart.json'
import mindmap from '../templates/scenes/mindmap.json'

import navbar from '../templates/fragments/navbar.json'
import sidebar from '../templates/fragments/sidebar.json'
import card from '../templates/fragments/card.json'
import cardGrid from '../templates/fragments/card-grid.json'
import form from '../templates/fragments/form.json'
import button from '../templates/fragments/button.json'
import input from '../templates/fragments/input.json'
import table from '../templates/fragments/table.json'
import chartArea from '../templates/fragments/chart-area.json'
import heroSection from '../templates/fragments/hero-section.json'
import footer from '../templates/fragments/footer.json'
import searchBar from '../templates/fragments/search-bar.json'

const SCENES = { dashboard, 'login-page': loginPage, 'system-arch': systemArch, 'er-diagram': erDiagram, flowchart, mindmap }
const FRAGMENTS = { navbar, sidebar, card, 'card-grid': cardGrid, form, button, input, table, 'chart-area': chartArea, 'hero-section': heroSection, footer, 'search-bar': searchBar }

export function loadScene(name) {
  const scene = SCENES[name]
  if (!scene) return null
  return { intent: 'create_scene', ...scene }
}

export function loadFragment(type) {
  return FRAGMENTS[type] || null
}

export function loadFragments(types) {
  return types.map(t => FRAGMENTS[t]).filter(Boolean)
}

export function listScenes() {
  return Object.keys(SCENES)
}

export function listFragments() {
  return Object.keys(FRAGMENTS)
}
