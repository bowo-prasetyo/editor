import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import pwa from './build/pwa.js'
import pkg from './package.json' with { type: 'json' }

// base: './' makes the build work from any folder or static host (even file-less subpaths).
export default defineConfig({
  base: './',
  plugins: [vue(), pwa()],
  // Shown in Settings, so people can tell which version they're running.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
