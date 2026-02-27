import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <-- 新增這行

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // 利用環境變數動態判斷部署環境
  // Cloudflare Pages 在建置時會自動注入 process.env.CF_PAGES = '1'
  const isCloudflare = process.env.CF_PAGES === '1';

  return {
    // 如果是在 Cloudflare 環境，根目錄設定為 '/'
    // 否則預設為 GitHub Pages 的 '/FunctionalFitnessPlanner/'
    base: isCloudflare ? '/' : '/FunctionalFitnessPlanner/',
    plugins: [
      react(),
      tailwindcss(),
    ],
  };
})
