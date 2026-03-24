import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // sql.js wasm is loaded at runtime, not bundled
      external: [],
    },
  },
  optimizeDeps: {
    exclude: ['sql.js'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
