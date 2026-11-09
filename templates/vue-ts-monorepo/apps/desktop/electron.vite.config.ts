import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// 共享类型包是 TS 源码，必须打包进主进程 / Preload / 渲染进程产物，
// 因此从 externalize 列表中排除。
const sharedSrc = resolve('../../packages/shared/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@app/shared'] })],
    resolve: {
      alias: {
        '@shared': sharedSrc
      }
    }
  },
  preload: {
    // sandbox: true 时 Preload 必须是 CommonJS，electron-vite 默认即输出 CJS
    plugins: [externalizeDepsPlugin({ exclude: ['@app/shared'] })],
    resolve: {
      alias: {
        '@shared': sharedSrc
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': sharedSrc
      }
    },
    plugins: [vue()]
  }
})
