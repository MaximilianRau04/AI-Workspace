import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:  fileURLToPath(new URL('index.html',  import.meta.url)),
        login: fileURLToPath(new URL('login.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/chats':    { target: 'http://localhost:5000', changeOrigin: true },
      '/config':   { target: 'http://localhost:5000', changeOrigin: true },
      '/docs':     { target: 'http://localhost:5000', changeOrigin: true },
      '/tts':      { target: 'http://localhost:5000', changeOrigin: true },
      '/stt':      { target: 'http://localhost:5000', changeOrigin: true },
      '/me':       { target: 'http://localhost:5000', changeOrigin: true },
      '/logout':   { target: 'http://localhost:5000', changeOrigin: true },
      '/register': { target: 'http://localhost:5000', changeOrigin: true },
      '/login': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        bypass(req) {
          if (req.method === 'GET') return '/login.html'
        },
      },
    },
  },
})
