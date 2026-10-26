import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 采集与语料服务独立运行在 8787，开发与预览阶段统一代理，避免跨域。
const PROXY = {
  '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy: PROXY },
  preview: { proxy: PROXY },
})
