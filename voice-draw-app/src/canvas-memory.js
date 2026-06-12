// ============================================================
// VoiceDraw Agent — Canvas Memory (alias ↔ shape_id 映射)
// ============================================================

const store = new Map() // alias → { shapeId, type }

export function set(alias, shapeId, type) {
  store.set(alias, { shapeId, type })
}

export function get(alias) {
  return store.get(alias) || null
}

export function remove(alias) {
  store.delete(alias)
}

export function removeByShapeId(shapeId) {
  for (const [alias, entry] of store) {
    if (entry.shapeId === shapeId) { store.delete(alias); return }
  }
}

export function list() {
  return Array.from(store, ([alias, entry]) => ({ alias, ...entry }))
}

export function clear() {
  store.clear()
}

export function snapshot() {
  return Array.from(store.entries())
}

export function restore(data) {
  store.clear()
  if (!Array.isArray(data)) return
  for (const [alias, entry] of data) {
    if (alias && entry?.shapeId) store.set(alias, entry)
  }
}
