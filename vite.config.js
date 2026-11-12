import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' makes the build work from any folder or static host (even file-less subpaths).
export default defineConfig({
  base: './',
  plugins: [vue()],
})
