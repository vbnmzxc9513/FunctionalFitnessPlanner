import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <-- 新增這行

// https://vite.dev/config/
export default defineConfig({
  base: '/FunctionalFitnessPlanner/', // <-- 這裡必須填入你的 GitHub 儲存庫名稱
  plugins: [
    react(),
    tailwindcss(),
  ],
})
