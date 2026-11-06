import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward all backend routes to FastAPI — no CORS issues in dev
      '/predict':    { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/explain':    { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/detect-ai':  { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health':     { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/model-info': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
