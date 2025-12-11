import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5160,      // <--- Aquí forzamos tu puerto 5160
    strictPort: true, // Falla si el puerto está ocupado (así te das cuenta)
    host: true       // Permite conexiones externas si es necesario
  }
})