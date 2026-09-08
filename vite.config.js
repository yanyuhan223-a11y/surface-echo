import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 用相对路径，使构建产物既能部署在域名根目录，也能部署在 GitHub Pages 的 /<仓库名>/ 子路径下
  base: './',
  plugins: [react()],
  // Blender 程序化导出的 GLB 走静态资源管线（二进制，不能当文本解析）
  assetsInclude: ['**/*.glb'],
  build: { assetsInlineLimit: 0 }
})
