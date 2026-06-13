// Mock import.meta.env for Node.js test environments
// Usage: node --import ./env-mock.mjs ./test-all.mjs
//
// Vite's import.meta.env is per-module and inaccessible from Node.js,
// so source modules should use the dual fallback pattern:
//   import.meta.env?.VITE_FOO || process.env?.VITE_FOO || 'default'
//
// This file sets process.env values so the fallback path works.

process.env.VITE_API_BASE = process.env.VITE_API_BASE || ''
