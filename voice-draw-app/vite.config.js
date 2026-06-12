import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5273,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
