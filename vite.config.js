import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5160,
    strictPort: true,
    host: true
  },
  preview: {
    port: process.env.PORT ? Number(process.env.PORT) : 5160,
    strictPort: true,
    host: true,
    // 👇 ESTO ES LO QUE ARREGLA EL ERROR
    allowedHosts: ['modulologisticasomyl-production.up.railway.app'] 
  }
})